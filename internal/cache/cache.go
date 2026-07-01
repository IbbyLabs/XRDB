// Package cache provides a two-tier render cache: in-memory LRU backed by the filesystem.
package cache

import (
	"container/list"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// Entry is a cached render result.
type Entry struct {
	Data      []byte
	ExpiresAt time.Time
}

// Disk tier bounds, enforced by the background sweep. Without the sweep the
// directory only shrinks when an expired key happens to be read again, so a
// long-lived instance accumulates files without limit.
const (
	sweepInterval    = 10 * time.Minute
	maxDiskFiles     = 20_000
	maxDiskBytes     = 2 << 30 // 2 GiB
	expiryHeaderSize = 8
)

type hotEntry struct {
	key   string
	entry *Entry
}

// Cache is a thread-safe two-tier render cache.
// Hot entries live in memory, bounded by entry count and total bytes; all
// entries persist to disk, bounded by the background sweep.
type Cache struct {
	dir        string
	ttl        time.Duration
	maxEntries int
	maxBytes   int64

	mu       sync.Mutex
	hot      map[string]*list.Element // value: *hotEntry
	lru      *list.List               // front = least recently used
	hotBytes int64

	// Maintained incrementally on Set/expiry and reconciled by each sweep,
	// so Stats never has to enumerate the cache directory.
	diskFiles atomic.Int64
	diskBytes atomic.Int64

	stop     chan struct{}
	stopOnce sync.Once
	done     chan struct{}
}

// New creates a Cache backed by dir, bounded in memory by maxEntries and
// maxBytes, and starts the background disk sweep. Call Close to stop it.
func New(dir string, ttl time.Duration, maxEntries int, maxBytes int64) (*Cache, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("cache mkdir: %w", err)
	}
	c := &Cache{
		dir:        dir,
		ttl:        ttl,
		maxEntries: maxEntries,
		maxBytes:   maxBytes,
		hot:        make(map[string]*list.Element, maxEntries),
		lru:        list.New(),
		stop:       make(chan struct{}),
		done:       make(chan struct{}),
	}
	go c.sweepLoop()
	return c, nil
}

// Close stops the background disk sweep and waits for it to exit.
// Safe to call multiple times and from concurrent goroutines.
func (c *Cache) Close() {
	c.stopOnce.Do(func() { close(c.stop) })
	<-c.done
}

// Get returns a cached entry for key, or (nil, false) on miss or expiry.
func (c *Cache) Get(key string) (*Entry, bool) {
	c.mu.Lock()

	// Hot tier — check without holding for I/O.
	if el, ok := c.hot[key]; ok {
		he := el.Value.(*hotEntry)
		if time.Now().Before(he.entry.ExpiresAt) {
			c.lru.MoveToBack(el)
			c.mu.Unlock()
			return he.entry, true
		}
		c.removeLocked(el)
	}
	diskPath := c.diskPath(key)
	c.mu.Unlock()

	// Disk tier — no lock held during filesystem I/O.
	data, err := os.ReadFile(diskPath)
	if err != nil {
		return nil, false
	}
	if len(data) < expiryHeaderSize {
		return nil, false
	}
	exp := decodeExpiry(data[:expiryHeaderSize])
	if time.Now().UnixNano() > exp {
		if info, statErr := os.Stat(diskPath); statErr == nil {
			if os.Remove(diskPath) == nil {
				c.diskFiles.Add(-1)
				c.diskBytes.Add(-info.Size())
			}
		}
		return nil, false
	}
	e := &Entry{Data: data[expiryHeaderSize:], ExpiresAt: time.Unix(0, exp)}
	c.mu.Lock()
	// Re-check hot tier: another goroutine may have promoted this entry while we were reading disk.
	if el, ok := c.hot[key]; ok {
		he := el.Value.(*hotEntry)
		if time.Now().Before(he.entry.ExpiresAt) {
			c.lru.MoveToBack(el)
			c.mu.Unlock()
			return he.entry, true
		}
		c.removeLocked(el)
	}
	c.storeLocked(key, e)
	c.mu.Unlock()
	return e, true
}

// Set stores data for key using the cache's default TTL.
func (c *Cache) Set(key string, data []byte) error {
	return c.SetWithTTL(key, data, 0)
}

// SetWithTTL stores data for key with an explicit TTL.
// If ttl is zero the cache's default TTL is used.
func (c *Cache) SetWithTTL(key string, data []byte, ttl time.Duration) error {
	if ttl <= 0 {
		ttl = c.ttl
	}
	exp := time.Now().Add(ttl)
	e := &Entry{Data: data, ExpiresAt: exp}

	c.mu.Lock()
	if el, ok := c.hot[key]; ok {
		c.removeLocked(el)
	}
	c.storeLocked(key, e)
	diskPath := c.diskPath(key)
	c.mu.Unlock()

	// Persist to disk — no lock held during filesystem I/O.
	payload := make([]byte, expiryHeaderSize+len(data))
	binary.BigEndian.PutUint64(payload[:expiryHeaderSize], uint64(exp.UnixNano()))
	copy(payload[expiryHeaderSize:], data)

	var prevSize int64 = -1
	if info, err := os.Stat(diskPath); err == nil {
		prevSize = info.Size()
	}
	if err := os.WriteFile(diskPath, payload, 0o644); err != nil {
		return fmt.Errorf("cache write: %w", err)
	}
	if prevSize >= 0 {
		c.diskBytes.Add(int64(len(payload)) - prevSize)
	} else {
		c.diskFiles.Add(1)
		c.diskBytes.Add(int64(len(payload)))
	}
	return nil
}

// Stats returns a snapshot of cache state without touching the filesystem.
func (c *Cache) Stats() Stats {
	c.mu.Lock()
	hotCount := len(c.hot)
	hotBytes := c.hotBytes
	dir := c.dir
	ttl := c.ttl
	c.mu.Unlock()

	return Stats{
		HotEntries:  hotCount,
		HotBytes:    hotBytes,
		DiskEntries: int(c.diskFiles.Load()),
		DiskBytes:   c.diskBytes.Load(),
		Dir:         dir,
		TTL:         ttl.String(),
	}
}

// Stats is a point-in-time view of cache state.
type Stats struct {
	HotEntries  int    `json:"hotEntries"`
	HotBytes    int64  `json:"hotBytes"`
	DiskEntries int    `json:"diskEntries"`
	DiskBytes   int64  `json:"diskBytes"`
	Dir         string `json:"dir"`
	TTL         string `json:"ttl"`
}

// storeLocked inserts key at the most-recently-used position and evicts from
// the least-recently-used end until both memory caps hold.
// Must be called with c.mu held and key absent from c.hot.
func (c *Cache) storeLocked(key string, e *Entry) {
	el := c.lru.PushBack(&hotEntry{key: key, entry: e})
	c.hot[key] = el
	c.hotBytes += int64(len(e.Data))
	for (len(c.hot) > c.maxEntries || c.hotBytes > c.maxBytes) && c.lru.Len() > 1 {
		front := c.lru.Front()
		if front == nil || front == el {
			break
		}
		c.removeLocked(front)
	}
}

// removeLocked drops an element from both LRU structures and the byte count.
// Must be called with c.mu held.
func (c *Cache) removeLocked(el *list.Element) {
	he := el.Value.(*hotEntry)
	c.lru.Remove(el)
	delete(c.hot, he.key)
	c.hotBytes -= int64(len(he.entry.Data))
}

func (c *Cache) sweepLoop() {
	defer close(c.done)
	c.sweep()
	ticker := time.NewTicker(sweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-c.stop:
			return
		case <-ticker.C:
			c.sweep()
		}
	}
}

// sweep removes expired disk entries, enforces the disk bounds oldest-first,
// and reconciles the counters that back Stats.
func (c *Cache) sweep() {
	c.sweepWithBounds(maxDiskFiles, maxDiskBytes)
}

func (c *Cache) sweepWithBounds(fileBound int, byteBound int64) {
	dirEntries, err := os.ReadDir(c.dir)
	if err != nil {
		return
	}

	type diskFile struct {
		path  string
		size  int64
		mtime time.Time
	}
	files := make([]diskFile, 0, len(dirEntries))
	now := time.Now().UnixNano()
	for _, de := range dirEntries {
		if de.IsDir() || filepath.Ext(de.Name()) != ".bin" {
			continue
		}
		path := filepath.Join(c.dir, de.Name())
		info, err := de.Info()
		if err != nil {
			continue
		}
		if exp, ok := readExpiry(path); ok && now > exp {
			_ = os.Remove(path)
			continue
		}
		files = append(files, diskFile{path: path, size: info.Size(), mtime: info.ModTime()})
	}

	sort.Slice(files, func(i, j int) bool { return files[i].mtime.Before(files[j].mtime) })
	var totalBytes int64
	for _, f := range files {
		totalBytes += f.size
	}
	remaining := len(files)
	for _, f := range files {
		if remaining <= fileBound && totalBytes <= byteBound {
			break
		}
		if os.Remove(f.path) == nil {
			remaining--
			totalBytes -= f.size
		}
	}

	c.diskFiles.Store(int64(remaining))
	c.diskBytes.Store(totalBytes)
}

// readExpiry reads the expiry header without loading the payload.
func readExpiry(path string) (int64, bool) {
	f, err := os.Open(path)
	if err != nil {
		return 0, false
	}
	defer f.Close()
	var hdr [expiryHeaderSize]byte
	if _, err := io.ReadFull(f, hdr[:]); err != nil {
		return 0, false
	}
	return decodeExpiry(hdr[:]), true
}

// decodeExpiry parses the big-endian Unix nanosecond expiry header.
func decodeExpiry(hdr []byte) int64 {
	return int64(binary.BigEndian.Uint64(hdr))
}

func (c *Cache) diskPath(key string) string {
	sum := sha256.Sum256([]byte(key))
	return filepath.Join(c.dir, hex.EncodeToString(sum[:])+".bin")
}
