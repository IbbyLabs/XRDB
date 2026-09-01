// Package provider defines the metadata provider interface and shared types.
package provider

import (
	"context"
	"sort"
	"time"
)

// UpcomingRelease is a release a title has not reached yet.
type UpcomingRelease struct {
	Kind string    // "digital" | "cinemas"
	Date time.Time // in the region the config asked for
}

// WatchProvider is a streaming/rental service that carries a media item.
type WatchProvider struct {
	ID       int    // TMDB provider_id
	Name     string // e.g. "Netflix", "Amazon Prime Video"
	LogoPath string // TMDB logo_path, e.g. "/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg" (may be empty)
}

// MediaMeta holds the metadata for a piece of media fetched from a provider.
type MediaMeta struct {
	Title string
	// OriginalTitle is the title in the original language, when it differs from
	// Title. Sources that are matched by name rather than by id search both, as
	// a national site often indexes only one of the two.
	OriginalTitle string
	Year          int
	Overview      string
	PosterURL     string // canonical poster image URL
	// PosterAltURL is a second poster file to use when PosterURL turns out to be
	// unusable. Kitsu publishes an "original" whose file is often smaller than
	// its "large", and sometimes landscape, and says nothing about either in the
	// API, so which is better is only knowable from the bytes.
	PosterAltURL string
	BackdropURL  string   // canonical backdrop image URL
	LogoURL      string   // logo image URL (may be empty)
	Ratings      []Rating // from this provider
	Language     string   // language of the returned artwork
	// IMDbID is the title's IMDb tt-id when the source knows it. Rating sources
	// are keyed by it, so a request arriving under another scheme needs it to
	// reach them.
	IMDbID string
	// TMDBID is TMDB's own id for the title, when the source knows it. Sources
	// matched through a third-party id index are checked against it.
	TMDBID string
	// PosterTextless reports that the poster returned is language-neutral, with
	// no title baked into the art. A "clean" request that no source could honour
	// comes back as ordinary art, and compositing the title logo onto that
	// prints the title twice — so the overlay asks this rather than trusting
	// what was requested. False whenever a source cannot tell.
	PosterTextless bool
	// BackdropHasTitle reports that the backdrop returned carries text, so a
	// logo overlay onto it would print the title twice. Positive rather than
	// inverted: most backdrops carry no title, and "cannot tell" must not read
	// as "has one" or every backdrop loses its overlay.
	BackdropHasTitle bool
	// Adult reports that the source flags the title itself as adult. TMDB carries
	// this per title rather than per image, so it says nothing about any
	// individual poster or backdrop.
	Adult         bool
	ContentRating string // e.g. "TV-MA", "R", "PG-13" (may be empty)
	ReleaseStatus string // "digital" | "cinemas" (may be empty; movies only)
	// UpcomingRelease is the next release still ahead of a title, empty once
	// anything has landed. Scoped to one region: a date from elsewhere reads as
	// authoritative and is not the viewer's.
	UpcomingRelease UpcomingRelease
	Genres          []string        // e.g. ["Action","Drama"] (may be empty)
	IsAnime         bool            // the title matched the anime ID mapping
	WatchProviders  []WatchProvider // streaming/rental services (may be empty)
	// TopRatedRank is the title's place in the locally computed top-rated film
	// ranking, or 0 when it does not place. See imdb_toprated.go for why this
	// is XRDB's own ranking rather than IMDb's published list.
	TopRatedRank int
	// Awards summarises major-award recognition (Oscars, Emmys) when a source
	// reports it. Empty when unknown or none.
	Awards AwardSummary
	// Stinger reports mid/post-credits scenes, read from TMDB's stinger keywords.
	Stinger StingerInfo
}

// StingerInfo records whether a title has a scene during or after the credits,
// from TMDB's "duringcreditsstinger"/"aftercreditsstinger" keyword tags.
type StingerInfo struct {
	MidCredits  bool
	PostCredits bool
}

// Has reports whether either kind of stinger is present.
func (s StingerInfo) Has() bool { return s.MidCredits || s.PostCredits }

// AwardSummary is a compact reading of a title's major-award recognition,
// parsed from a source's free-text awards line.
type AwardSummary struct {
	Kind string // "oscar" | "emmy" | "" (none/unknown)
	Won  bool   // true = won at least one; false = nominated only
}

// Has reports whether any recognition was found.
func (a AwardSummary) Has() bool { return a.Kind != "" }

// Rating is a single provider rating observation.
type Rating struct {
	Source string  // e.g. "tmdb", "imdb", "rt"
	Value  float64 // normalized 0–10
	Votes  int     // vote count, 0 if unavailable
	Label  string  // display string, e.g. "8.4"
	// Unavailable marks a source that was wanted and held out, rather than one
	// with no rating for the title. It carries no value and must never reach an
	// average; it exists so the badge can say the source is unreachable instead
	// of vanishing and reading as "this title has no score".
	Unavailable bool
	// Withheld marks a source held back by a setting rather than by a fault, so
	// the strip can say which without a second lookup.
	Withheld bool
}

// Provider is the interface all metadata providers must satisfy.
type Provider interface {
	// Name returns the provider identifier, e.g. "tmdb".
	Name() string
	// Fetch retrieves metadata for a media item identified by id.
	// id format is provider-specific; TMDB uses numeric IDs, IMDB uses tt-prefixed.
	Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error)
}

// RatingSourcer is implemented by a provider that knows exactly which rating
// sources it can supply, letting the render path skip it when none of them were
// selected. A provider that does not implement it is called on every render,
// so a source left undeclared is a source fetched and thrown away.
type RatingSourcer interface {
	RatingSources() []string
}

// Ranker is implemented by a provider that supplies a top-rated rank alongside
// its ratings. The rank is wanted independently of the score, so such a
// provider is still called when the badge is on and its rating is not shown.
type Ranker interface {
	RanksTitles() bool
}

// TitleRatingProvider is implemented by a provider that has no way to look a
// title up by id and needs its name and year instead. The render path already
// holds both by the time ratings are collected, so it calls FetchByTitle for
// these rather than Fetch.
type TitleRatingProvider interface {
	Provider
	FetchByTitle(ctx context.Context, mediaType, title, originalTitle string, year int) (*MediaMeta, error)
}

// inflightCall tracks an in-progress fetch so concurrent callers for the same
// key can wait on the single in-flight request rather than issuing duplicates.
// The fetch runs with its own detached context so one caller's cancellation
// does not abort the work for remaining waiters; the fetch context is only
// cancelled once all waiters have dropped (waiters guarded by CachedFetch.mu).
type inflightCall struct {
	done    chan struct{}
	cancel  context.CancelFunc
	waiters int // guarded by CachedFetch.mu
	val     *MediaMeta
	err     error
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
	// Coalesce: if a fetch is already in-flight for this key, join as a waiter.
	if call, ok := c.inflight[key]; ok {
		call.waiters++
		c.mu.Unlock()
		defer func() {
			c.mu.Lock()
			call.waiters--
			if call.waiters == 0 {
				call.cancel()
			}
			c.mu.Unlock()
		}()
		select {
		case <-call.done:
			return call.val, call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	// Register a new in-flight call with its own detached context so
	// cancellation of one caller does not abort the fetch for all waiters.
	callCtx, callCancel := context.WithCancel(context.Background())
	call := &inflightCall{
		done:    make(chan struct{}),
		cancel:  callCancel,
		waiters: 1,
	}
	c.inflight[key] = call
	c.mu.Unlock()

	go func() {
		call.val, call.err = c.inner.Fetch(callCtx, mediaType, id)
		close(call.done)
		c.mu.Lock()
		delete(c.inflight, key)
		if call.err == nil {
			c.store[key] = &cacheEntry{meta: call.val, expiresAt: time.Now().Add(c.ttl)}
		}
		c.mu.Unlock()
	}()

	defer func() {
		c.mu.Lock()
		call.waiters--
		if call.waiters == 0 {
			call.cancel()
		}
		c.mu.Unlock()
	}()
	select {
	case <-call.done:
		return call.val, call.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
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
