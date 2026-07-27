package compose

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// countingLimiter answers once, then refuses on rate-limit grounds, counting
// how often it was actually asked.
type countingLimiter struct {
	name     string
	calls    atomic.Int32
	refusing atomic.Bool
}

func (c *countingLimiter) Name() string { return c.name }

func (c *countingLimiter) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	c.calls.Add(1)
	if c.refusing.Load() {
		return nil, &provider.RateLimitError{Source: c.name, RetryAfter: 5 * time.Second, Status: 429}
	}
	return &provider.MediaMeta{Ratings: []provider.Rating{
		{Source: c.name, Value: 7.5, Label: "7.5"},
	}}, nil
}

// A source that has refused holds up every later render by the time it takes to
// refuse again. Once it is in cooldown the render must not call it at all.
func TestACoolingOffSourceIsNotCalled(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"simkl"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}

	ratingsFor(t, p, req) // first call succeeds and is remembered
	src.refusing.Store(true)
	ratingsFor(t, p, req) // second call refuses and starts the cooldown
	calls := src.calls.Load()

	for i := 0; i < 5; i++ {
		ratingsFor(t, p, req)
	}
	if got := src.calls.Load(); got != calls {
		t.Errorf("the source was called %d more times while cooling off", got-calls)
	}
}

// Holding the source out must not cost the badge: the remembered value stands
// in while the source is refusing.
func TestCooldownStillServesTheRememberedRating(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"simkl"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}

	ratingsFor(t, p, req)
	src.refusing.Store(true)
	ratingsFor(t, p, req)

	got := ratingsFor(t, p, req)
	if len(got) != 1 || got[0].Source != "simkl" {
		t.Errorf("the cooldown erased the badge: got %+v", got)
	}
}

// A source that refuses before it has ever answered has nothing remembered, so
// the render carries on without it rather than waiting on it.
func TestCooldownWithNothingRememberedDropsTheSource(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	src.refusing.Store(true)
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"simkl"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}

	ratingsFor(t, p, req)
	if got := ratingsFor(t, p, req); len(got) != 0 {
		t.Errorf("expected no ratings, got %+v", got)
	}
	if src.calls.Load() != 1 {
		t.Errorf("the source was called %d times; the cooldown should have stopped the second", src.calls.Load())
	}
}
