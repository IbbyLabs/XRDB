package compose

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"xrdb_rewrite/internal/provider"
)

// DefaultRatingsCacheTTL is how long a source's answer for one title stands in
// for another fetch of the same title.
const DefaultRatingsCacheTTL = 6 * time.Hour

// ratingsCacheMax bounds the number of remembered answers.
const ratingsCacheMax = 20_000

// ratingsCache remembers what a source said about a title.
//
// A render is cached under its whole config, but ratings depend only on the
// title, so the same title under two configs used to cost two fetches of the
// same data. Several of these sources meter by the request and one of them
// meters by the day, which makes the duplicate fetch the expensive kind of
// waste. Concurrent misses for one key share a single fetch, so a catalogue
// opening on twenty copies of a title still asks once.
type ratingsCache struct {
	ttl time.Duration
	// path is where the remembered answers are kept across restarts. The render
	// cache is already two-tier; this one was memory-only, so every restart threw
	// away a quarter of a day of metered lookups and paid for them again. Empty
	// disables persistence.
	path string

	mu       sync.Mutex
	entries  map[string]ratingsEntry
	inflight map[string]*ratingsCall
}

type ratingsEntry struct {
	Meta      *provider.MediaMeta `json:"meta"`
	ExpiresAt time.Time           `json:"expiresAt"`
}

type ratingsCall struct {
	done chan struct{}
	meta *provider.MediaMeta
	err  error
}

func newRatingsCache(ttl time.Duration) *ratingsCache {
	if ttl <= 0 {
		ttl = DefaultRatingsCacheTTL
	}
	return &ratingsCache{
		ttl:      ttl,
		entries:  make(map[string]ratingsEntry),
		inflight: make(map[string]*ratingsCall),
	}
}

// do returns the remembered answer for key, or runs fetch to produce one.
// Only successful answers carrying ratings are remembered: a failure is the
// case the health tracker's fallback exists for, and caching an empty answer
// would hold a source's outage past its end.
func (c *ratingsCache) do(ctx context.Context, key string, fetch func() (*provider.MediaMeta, error)) (*provider.MediaMeta, error) {
	if c == nil {
		return fetch()
	}

	c.mu.Lock()
	if e, ok := c.entries[key]; ok && time.Now().Before(e.ExpiresAt) {
		c.mu.Unlock()
		return e.Meta, nil
	}
	if call, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		select {
		case <-call.done:
			return call.meta, call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &ratingsCall{done: make(chan struct{})}
	c.inflight[key] = call
	c.mu.Unlock()

	call.meta, call.err = fetch()

	c.mu.Lock()
	delete(c.inflight, key)
	if call.err == nil && call.meta != nil && len(call.meta.Ratings) > 0 {
		if len(c.entries) >= ratingsCacheMax {
			c.evictLocked()
		}
		c.entries[key] = ratingsEntry{Meta: call.meta, ExpiresAt: time.Now().Add(c.ttl)}
	}
	c.mu.Unlock()

	close(call.done)
	return call.meta, call.err
}

// Len reports how many answers are held, for the admin surface.
func (c *ratingsCache) Len() int {
	if c == nil {
		return 0
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

// evictLocked makes room at the cap. Expired entries go first; if that is not
// enough, the entries closest to expiry go next. Dropping the whole map instead
// meant crossing the cap refetched every title still in use, in one burst,
// against sources that meter by the request.
func (c *ratingsCache) evictLocked() {
	now := time.Now()
	for k, e := range c.entries {
		if now.After(e.ExpiresAt) {
			delete(c.entries, k)
		}
	}
	if len(c.entries) < ratingsCacheMax {
		return
	}
	type aged struct {
		key string
		at  time.Time
	}
	all := make([]aged, 0, len(c.entries))
	for k, e := range c.entries {
		all = append(all, aged{k, e.ExpiresAt})
	}
	sort.Slice(all, func(i, j int) bool { return all[i].at.Before(all[j].at) })
	// A tenth at a time, so the cap is not hit again on the very next write.
	for i := 0; i < len(all)/10+1; i++ {
		delete(c.entries, all[i].key)
	}
}

// ratingsCacheFile is the name the snapshot takes inside the cache directory.
const ratingsCacheFile = "ratings-cache.json"

// ratingsCacheShape versions the stored MediaMeta shape. Bump it whenever a
// field is added to MediaMeta that a render reads OR the interpretation of an
// existing field changes (e.g. a parser fix), so entries produced by older code
// are discarded on load rather than serving a stale reading.
// (2: added Awards and Stinger. 3: awards win/nominate parser fix.
// 4: MDBList TMDB and Metacritic user scale fix.)
const ratingsCacheShape = 4

// ratingsSnapshot is the on-disk form: the shape version plus the entries.
type ratingsSnapshot struct {
	Shape   int                     `json:"shape"`
	Entries map[string]ratingsEntry `json:"entries"`
}

// load reads a previous snapshot, discarding anything already expired. A
// missing or unreadable file is not an error: the cache simply starts empty.
func (c *ratingsCache) load(logger *slog.Logger) {
	if c == nil || c.path == "" {
		return
	}
	data, err := os.ReadFile(c.path)
	if err != nil {
		return
	}
	var snap ratingsSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		logger.Warn("Could not read the remembered ratings; starting empty",
			"path", c.path, "error", err)
		return
	}
	if snap.Shape != ratingsCacheShape {
		// A different shape means the entries were fetched by code that read a
		// different MediaMeta; discard them rather than serve titles with a new
		// field silently empty.
		logger.Info("Discarded remembered ratings from an older shape",
			"stored_shape", snap.Shape, "current_shape", ratingsCacheShape)
		return
	}
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, e := range snap.Entries {
		if e.Meta != nil && now.Before(e.ExpiresAt) {
			c.entries[k] = e
		}
	}
	logger.Info("Restored remembered ratings from disk",
		"kept", len(c.entries), "stored", len(snap.Entries))
}

// Save writes the unexpired answers so a restart does not refetch them. It is
// called on a timer and at shutdown, and writes through a temporary file so a
// kill mid-write cannot leave a corrupt snapshot behind.
func (c *ratingsCache) Save() error {
	if c == nil || c.path == "" {
		return nil
	}
	now := time.Now()
	c.mu.Lock()
	live := make(map[string]ratingsEntry, len(c.entries))
	for k, e := range c.entries {
		if now.Before(e.ExpiresAt) {
			live[k] = e
		}
	}
	c.mu.Unlock()

	data, err := json.Marshal(ratingsSnapshot{Shape: ratingsCacheShape, Entries: live})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(c.path), 0o755); err != nil {
		return err
	}
	tmp := c.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, c.path)
}

// SetRatingsCachePath points the ratings cache at a file and loads whatever is
// already there.
func (p *Pipeline) SetRatingsCachePath(dir string, logger *slog.Logger) {
	if p.ratings == nil || dir == "" {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	p.ratings.path = filepath.Join(dir, ratingsCacheFile)
	p.ratings.load(logger)
}

// SaveRatingsCache writes the remembered answers to disk.
func (p *Pipeline) SaveRatingsCache() error { return p.ratings.Save() }
