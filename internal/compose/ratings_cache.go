package compose

import (
	"context"
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

	mu       sync.Mutex
	entries  map[string]ratingsEntry
	inflight map[string]*ratingsCall
}

type ratingsEntry struct {
	meta      *provider.MediaMeta
	expiresAt time.Time
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
	if e, ok := c.entries[key]; ok && time.Now().Before(e.expiresAt) {
		c.mu.Unlock()
		return e.meta, nil
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
			c.entries = make(map[string]ratingsEntry, ratingsCacheMax)
		}
		c.entries[key] = ratingsEntry{meta: call.meta, expiresAt: time.Now().Add(c.ttl)}
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
