package server

import (
	"sync"
	"time"
)

// notFoundCacheMax bounds the remembered keys. A burst is one title across many
// episodes, so this holds far more than a burst needs.
const notFoundCacheMax = 20_000

// notFoundCache remembers, briefly, that a render produced no artwork.
//
// A not-found answer is never cached as an image: a transient failure would be
// frozen for the whole TTL. But the work behind it is real — every provider is
// asked before the pipeline concludes there is nothing — and a catalogue of a
// title with no art repeats that per episode. While an upstream is slow each
// repeat pays its full timeout.
//
// The term is short by design. It collapses a burst without outliving the
// outage that caused it, so artwork appearing upstream still shows up within
// the minute rather than at the end of a render TTL.
type notFoundCache struct {
	ttl time.Duration

	mu      sync.Mutex
	entries map[string]time.Time
}

func newNotFoundCache(ttl time.Duration) *notFoundCache {
	if ttl <= 0 {
		return nil
	}
	return &notFoundCache{ttl: ttl, entries: make(map[string]time.Time)}
}

// Has reports whether this key recently produced no artwork.
func (c *notFoundCache) Has(key string) bool {
	if c == nil {
		return false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	expires, ok := c.entries[key]
	if !ok {
		return false
	}
	if time.Now().After(expires) {
		delete(c.entries, key)
		return false
	}
	return true
}

// Remember records that this key produced no artwork.
func (c *notFoundCache) Remember(key string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= notFoundCacheMax {
		c.evictLocked()
	}
	c.entries[key] = time.Now().Add(c.ttl)
}

// Forget drops a key, so artwork that appears upstream is served at once rather
// than waiting out the term.
func (c *notFoundCache) Forget(key string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	delete(c.entries, key)
	c.mu.Unlock()
}

// evictLocked drops expired keys, and if none had expired, clears the map. The
// entries are a fixed size and live for seconds, so reclaiming the whole set is
// cheaper than tracking an eviction order for them.
func (c *notFoundCache) evictLocked() {
	now := time.Now()
	for k, expires := range c.entries {
		if now.After(expires) {
			delete(c.entries, k)
		}
	}
	if len(c.entries) >= notFoundCacheMax {
		clear(c.entries)
	}
}

// Len reports how many keys are held, for the admin surface.
func (c *notFoundCache) Len() int {
	if c == nil {
		return 0
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}
