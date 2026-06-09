// Package provider defines the metadata provider interface and shared types.
package provider

import (
	"context"
	"sort"
	"sync"
	"time"
)

// WatchProvider is a streaming/rental service that carries a media item.
type WatchProvider struct {
	ID   int    // TMDB provider_id
	Name string // e.g. "Netflix", "Amazon Prime Video"
}

// MediaMeta holds the metadata for a piece of media fetched from a provider.
type MediaMeta struct {
	Title          string
	Year           int
	Overview       string
	PosterURL      string          // canonical poster image URL
	BackdropURL    string          // canonical backdrop image URL
	LogoURL        string          // logo image URL (may be empty)
	Ratings        []Rating        // from this provider
	Language       string          // language of the returned artwork
	ContentRating  string          // e.g. "TV-MA", "R", "PG-13" (may be empty)
	Genres         []string        // e.g. ["Action","Drama"] (may be empty)
	WatchProviders []WatchProvider // streaming/rental services (may be empty)
}

// Rating is a single provider rating observation.
type Rating struct {
	Source string  // e.g. "tmdb", "imdb", "rt"
	Value  float64 // normalized 0–10
	Votes  int     // vote count, 0 if unavailable
	Label  string  // display string, e.g. "8.4"
}

// Provider is the interface all metadata providers must satisfy.
type Provider interface {
	// Name returns the provider identifier, e.g. "tmdb".
	Name() string
	// Fetch retrieves metadata for a media item identified by id.
	// id format is provider-specific; TMDB uses numeric IDs, IMDB uses tt-prefixed.
	Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error)
}

// inflightCall tracks an in-progress fetch so concurrent callers for the same
// key can wait on the single in-flight request rather than issuing duplicates.
type inflightCall struct {
	wg  sync.WaitGroup
	val *MediaMeta
	err error
}

// CachedFetch wraps a Provider with a simple in-memory TTL cache and
// single-flight request coalescing (concurrent identical keys share one fetch).
type CachedFetch struct {
	inner    Provider
	ttl      time.Duration
	mu       cacheMu
	store    map[string]*cacheEntry
	inflight map[string]*inflightCall
}

type cacheEntry struct {
	meta      *MediaMeta
	expiresAt time.Time
}

// NewCachedFetch wraps provider p with a TTL cache.
func NewCachedFetch(p Provider, ttl time.Duration) *CachedFetch {
	return &CachedFetch{
		inner:    p,
		ttl:      ttl,
		store:    make(map[string]*cacheEntry),
		inflight: make(map[string]*inflightCall),
	}
}

// Name satisfies the Provider interface.
func (c *CachedFetch) Name() string { return c.inner.Name() }

// Fetch returns a cached result if fresh, otherwise delegates to the inner
// provider. Concurrent calls for the same key are coalesced: only one upstream
// request is issued and all waiters receive the same result.
func (c *CachedFetch) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	key := mediaType + ":" + id

	c.mu.Lock()
	if entry, ok := c.store[key]; ok && time.Now().Before(entry.expiresAt) {
		c.mu.Unlock()
		return entry.meta, nil
	}
	// Coalesce: if a fetch is already in-flight for this key, wait for it.
	if call, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		call.wg.Wait()
		return call.val, call.err
	}
	// Register a new in-flight call before releasing the lock.
	call := &inflightCall{}
	call.wg.Add(1)
	c.inflight[key] = call
	c.mu.Unlock()

	call.val, call.err = c.inner.Fetch(ctx, mediaType, id)
	call.wg.Done()

	c.mu.Lock()
	delete(c.inflight, key)
	if call.err == nil {
		c.store[key] = &cacheEntry{meta: call.val, expiresAt: time.Now().Add(c.ttl)}
	}
	c.mu.Unlock()

	return call.val, call.err
}

// Registry holds a set of named providers for lookup.
type Registry struct {
	providers map[string]Provider
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Provider)}
}

// Register adds a provider. Panics on duplicate name.
func (r *Registry) Register(p Provider) {
	if _, ok := r.providers[p.Name()]; ok {
		panic("provider already registered: " + p.Name())
	}
	r.providers[p.Name()] = p
}

// Get returns the provider for name, or nil if not registered.
func (r *Registry) Get(name string) Provider {
	return r.providers[name]
}

// Names returns all registered provider names in sorted order.
func (r *Registry) Names() []string {
	out := make([]string, 0, len(r.providers))
	for k := range r.providers {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
