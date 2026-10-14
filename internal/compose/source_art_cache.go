package compose

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"image"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"golang.org/x/sync/singleflight"

	"xrdb_rewrite/internal/atomicfile"
)

const (
	// DefaultSourceArtCacheTTL is how long a stored source image is served.
	DefaultSourceArtCacheTTL = 168 * time.Hour
	sourceArtSubdir          = "source-art"
	sourceArtSuffix          = ".img"
	sourceArtHeaderLen       = 8
	// A sweep trims to this share of the cap so the next write does not start another.
	sourceArtTrimTo = 0.9
)

// sourceArtCache keeps downloaded source images on disk, keyed by a hash of the
// exact URL. Each file is an 8-byte big-endian store time followed by the body.
type sourceArtCache struct {
	dir      string
	maxBytes int64
	ttl      time.Duration
	log      *slog.Logger

	total    atomic.Int64
	sweeping atomic.Bool
	flight   singleflight.Group
	now      func() time.Time

	hits   atomic.Int64
	misses atomic.Int64
}

// newSourceArtCache returns nil when maxBytes is not positive. It creates the
// directory and counts what is already stored.
func newSourceArtCache(cacheDir string, maxBytes int64, ttl time.Duration, log *slog.Logger) (*sourceArtCache, error) {
	if maxBytes <= 0 || cacheDir == "" {
		return nil, nil
	}
	if ttl <= 0 {
		ttl = DefaultSourceArtCacheTTL
	}
	if log == nil {
		log = slog.Default()
	}
	c := &sourceArtCache{
		dir:      filepath.Join(cacheDir, sourceArtSubdir),
		maxBytes: maxBytes,
		ttl:      ttl,
		log:      log,
		now:      time.Now,
	}
	if err := os.MkdirAll(c.dir, 0o755); err != nil {
		return nil, err
	}
	for _, e := range c.entries() {
		c.total.Add(e.size)
	}
	if c.total.Load() > c.maxBytes {
		go c.sweep()
	}
	return c, nil
}

func (c *sourceArtCache) path(url string) string {
	sum := sha256.Sum256([]byte(url))
	return filepath.Join(c.dir, hex.EncodeToString(sum[:])+sourceArtSuffix)
}

// get returns the stored body for url, or false on a miss, an expired entry, or
// an unreadable one (which is removed).
func (c *sourceArtCache) get(ctx context.Context, url string) ([]byte, bool) {
	p := c.path(url)
	raw, err := os.ReadFile(p)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			c.log.WarnContext(ctx, "Could not read a stored source image", "error", err)
		}
		return nil, false
	}
	if len(raw) <= sourceArtHeaderLen {
		c.drop(ctx, p, int64(len(raw)), "truncated")
		return nil, false
	}
	stored := time.Unix(int64(binary.BigEndian.Uint64(raw[:sourceArtHeaderLen])), 0)
	if c.now().Sub(stored) > c.ttl {
		c.drop(ctx, p, int64(len(raw)), "expired")
		return nil, false
	}
	body := raw[sourceArtHeaderLen:]
	if !looksLikeImage(body) {
		c.drop(ctx, p, int64(len(raw)), "not an image")
		return nil, false
	}
	now := c.now()
	_ = os.Chtimes(p, now, now)
	return body, true
}

func (c *sourceArtCache) drop(ctx context.Context, path string, size int64, reason string) {
	if err := os.Remove(path); err == nil {
		c.total.Add(-size)
	}
	c.log.DebugContext(ctx, "Dropped a stored source image", "reason", reason)
}

// put stores body. A body that is not an image, or is over the size limit, is
// left out.
func (c *sourceArtCache) put(ctx context.Context, url string, body []byte) {
	if len(body) == 0 || len(body) > maxImageBytes || !looksLikeImage(body) {
		return
	}
	buf := make([]byte, sourceArtHeaderLen+len(body))
	binary.BigEndian.PutUint64(buf, uint64(c.now().Unix()))
	copy(buf[sourceArtHeaderLen:], body)
	p := c.path(url)
	var old int64
	if st, err := os.Stat(p); err == nil {
		old = st.Size()
	}
	if err := atomicfile.WriteFile(p, buf, 0o644); err != nil {
		c.log.WarnContext(ctx, "Could not store a source image", "error", err)
		return
	}
	if total := c.total.Add(int64(len(buf)) - old); total > c.maxBytes {
		go c.sweep()
	}
}

func looksLikeImage(b []byte) bool {
	_, _, err := image.DecodeConfig(bytes.NewReader(b))
	return err == nil
}

type sourceArtEntry struct {
	path  string
	size  int64
	mtime time.Time
}

func (c *sourceArtCache) entries() []sourceArtEntry {
	des, err := os.ReadDir(c.dir)
	if err != nil {
		return nil
	}
	out := make([]sourceArtEntry, 0, len(des))
	for _, de := range des {
		if de.IsDir() || !strings.HasSuffix(de.Name(), sourceArtSuffix) {
			continue
		}
		info, err := de.Info()
		if err != nil {
			continue
		}
		out = append(out, sourceArtEntry{filepath.Join(c.dir, de.Name()), info.Size(), info.ModTime()})
	}
	return out
}

// sweep removes the least recently used files until the store is under the cap.
// Only one runs at a time.
func (c *sourceArtCache) sweep() {
	if !c.sweeping.CompareAndSwap(false, true) {
		return
	}
	defer c.sweeping.Store(false)
	list := c.entries()
	var total int64
	for _, e := range list {
		total += e.size
	}
	c.total.Store(total)
	if total <= c.maxBytes {
		return
	}
	sort.Slice(list, func(i, j int) bool { return list[i].mtime.Before(list[j].mtime) })
	target := int64(float64(c.maxBytes) * sourceArtTrimTo)
	removed := 0
	for _, e := range list {
		if total <= target {
			break
		}
		if err := os.Remove(e.path); err != nil {
			continue
		}
		total -= e.size
		removed++
	}
	c.total.Store(total)
	c.log.Debug("Trimmed the source image cache", "removed_files", removed,
		"size_bytes", total, "cap_bytes", c.maxBytes)
}

// fetch serves url from the store, or runs miss once for all concurrent callers
// and stores what it returns.
func (c *sourceArtCache) fetch(ctx context.Context, url string, miss func(context.Context) ([]byte, error)) ([]byte, error) {
	if body, ok := c.get(ctx, url); ok {
		c.hits.Add(1)
		c.log.DebugContext(ctx, "Served a source image from the local store", "hits", c.hits.Load())
		return body, nil
	}
	c.misses.Add(1)
	ch := c.flight.DoChan(url, func() (any, error) {
		body, err := miss(ctx)
		if err == nil {
			c.put(ctx, url, body)
		}
		return body, err
	})
	select {
	case r := <-ch:
		if r.Err != nil {
			if r.Shared && ctx.Err() == nil && (errors.Is(r.Err, context.Canceled) || errors.Is(r.Err, context.DeadlineExceeded)) {
				return miss(ctx)
			}
			return nil, r.Err
		}
		return r.Val.([]byte), nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
