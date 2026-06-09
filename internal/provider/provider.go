// Package provider defines the metadata provider interface and shared types.
package provider

import (
	"context"
	"time"
)

// MediaMeta holds the metadata for a piece of media fetched from a provider.
type MediaMeta struct {
	Title       string
	Year        int
	Overview    string
	PosterURL   string   // canonical poster image URL
	BackdropURL string   // canonical backdrop image URL
	LogoURL     string   // logo image URL (may be empty)
	Ratings     []Rating // from this provider
	Language    string   // language of the returned artwork
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

// CachedFetch wraps a Provider with a simple in-memory TTL cache.
type CachedFetch struct {
	inner Provider
	ttl   time.Duration
	mu    cacheMu
	store map[string]*cacheEntry
}

type cacheEntry struct {
	meta      *MediaMeta
	expiresAt time.Time
}

// NewCachedFetch wraps provider p with a TTL cache.
func NewCachedFetch(p Provider, ttl time.Duration) *CachedFetch {
	return &CachedFetch{
		inner: p,
		ttl:   ttl,
		store: make(map[string]*cacheEntry),
	}
}

// Name satisfies the Provider interface.
func (c *CachedFetch) Name() string { return c.inner.Name() }

// Fetch returns a cached result if fresh, otherwise delegates to the inner provider.
func (c *CachedFetch) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	key := mediaType + ":" + id
	c.mu.Lock()
	entry, ok := c.store[key]
	c.mu.Unlock()
	if ok && time.Now().Before(entry.expiresAt) {
		return entry.meta, nil
	}
	meta, err := c.inner.Fetch(ctx, mediaType, id)
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	c.store[key] = &cacheEntry{meta: meta, expiresAt: time.Now().Add(c.ttl)}
	c.mu.Unlock()
	return meta, nil
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

// Names returns all registered provider names.
func (r *Registry) Names() []string {
	out := make([]string, 0, len(r.providers))
	for k := range r.providers {
		out = append(out, k)
	}
	return out
}
