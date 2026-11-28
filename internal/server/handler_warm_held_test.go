package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
)

// sweepHeldRating holds named sweeps with ErrGovernorBacklog, as MDBList's
// top-of-hour window does, and answers everyone else.
type sweepHeldRating struct {
	hold     bool
	answered atomic.Int32
}

func (r *sweepHeldRating) Name() string            { return "imdb" }
func (r *sweepHeldRating) RatingSources() []string { return []string{"imdb"} }
func (r *sweepHeldRating) Fetch(ctx context.Context, _, _ string) (*provider.MediaMeta, error) {
	if r.hold && provider.CallerClassFrom(ctx) == provider.CallerBulk {
		return nil, provider.ErrGovernorBacklog
	}
	r.answered.Add(1)
	return &provider.MediaMeta{Ratings: []provider.Rating{{Source: "imdb", Value: 7.9, Votes: 250000}}}, nil
}

func newWarmHeldRig(t *testing.T, rating *sweepHeldRating) (http.Handler, *cache.Cache) {
	t.Helper()
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	})
	reg.Register(rating)
	pipeline := compose.NewWithFetcher(reg, logoFailingFetcher{data: testSourcePNG(t, 300, 450)})

	store := openTestStore(t)
	p := &profile.Profile{ID: "warm-held-cfg", Type: "poster", Config: json.RawMessage(`{"ratings":["imdb"]}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	c, err := cache.New(t.TempDir(), 72*time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", store, nil, pipeline, c, config.Config{
		DegradedCacheTTL:  20 * time.Minute,
		HeldOutCacheTTL:   3 * time.Hour,
		QueueHeldCacheTTL: 15 * time.Minute,
		CacheTTL:          72 * time.Hour,
	})
	return h, c
}

func serveWarmHeld(t *testing.T, h http.Handler, warm bool) *httptest.ResponseRecorder {
	t.Helper()
	ctx := context.Background()
	if warm {
		ctx = withWarm(ctx)
	}
	rq := httptest.NewRequestWithContext(ctx, http.MethodGet, "/poster/tt0111161?config=warm-held-cfg", nil)
	if !warm {
		rq.Header.Set("User-Agent", "okhttp/4.12.0")
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, rq)
	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rr.Code, rr.Body.String())
	}
	return rr
}

// A warm render that a queue gate held a badge back from is not stored, so the
// next person's request renders fresh and gets the badge.
func TestAWarmRenderHeldByAQueueGateIsNotStored(t *testing.T) {
	rating := &sweepHeldRating{hold: true}
	h, c := newWarmHeldRig(t, rating)

	warm := serveWarmHeld(t, h, true)
	if rating.answered.Load() != 0 {
		t.Fatal("the warm lookup was answered; it should have been held")
	}
	key := warm.Header().Get("X-Cache-Key")
	if key == "" {
		t.Fatal("no cache key on the warm response")
	}
	if _, ok := c.Get(key); ok {
		t.Fatal("a warm render missing a held badge was stored")
	}

	person := serveWarmHeld(t, h, false)
	if person.Header().Get("X-Cache") == "HIT" {
		t.Fatal("the interactive request was served from cache")
	}
	if rating.answered.Load() != 1 {
		t.Fatalf("the rating source answered %d times for the interactive render, want 1", rating.answered.Load())
	}
	if person.Header().Get("ETag") == warm.Header().Get("ETag") {
		t.Error("the interactive render matches the badge-less warm one")
	}
	e, ok := c.Get(key)
	if !ok {
		t.Fatal("the interactive render was not stored")
	}
	if time.Until(e.ExpiresAt) <= time.Hour {
		t.Errorf("interactive render stored until %s, want the normal term", e.ExpiresAt)
	}
}

// Warming still stores a render nothing was held back from.
func TestACompleteWarmRenderIsStillStored(t *testing.T) {
	rating := &sweepHeldRating{}
	h, c := newWarmHeldRig(t, rating)

	warm := serveWarmHeld(t, h, true)
	if _, ok := c.Get(warm.Header().Get("X-Cache-Key")); !ok {
		t.Fatal("a complete warm render was not stored")
	}
	person := serveWarmHeld(t, h, false)
	if person.Header().Get("X-Cache") != "HIT" {
		t.Error("the interactive request after a complete warm render was not a cache hit")
	}
}

func TestRenderStoreFor(t *testing.T) {
	bg := context.Background()
	for _, tc := range []struct {
		name     string
		ctx      context.Context
		degraded bool
		want     renderStore
	}{
		{"warm", provider.WithCallerClass(withWarm(bg), provider.CallerBulk), false, storeRender},
		{"warm held by our gate", provider.WithCallerClass(withWarm(bg), provider.CallerBulk), true, skipRenderStore},
		{"named sweep", provider.WithCallerClass(bg, provider.CallerBulk), false, skipRenderStore},
		{"named sweep held", provider.WithCallerClass(bg, provider.CallerBulk), true, skipRenderStore},
		{"no user agent", provider.WithCallerClass(bg, provider.CallerUnknown), false, storeRenderFromBulk},
		{"no user agent held", provider.WithCallerClass(bg, provider.CallerUnknown), true, storeRenderFromBulk},
		{"interactive", provider.WithCallerClass(bg, provider.CallerInteractive), false, storeRender},
		{"interactive held", provider.WithCallerClass(bg, provider.CallerInteractive), true, storeRender},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := renderStoreFor(tc.ctx, tc.degraded); got != tc.want {
				t.Errorf("renderStoreFor = %d, want %d", got, tc.want)
			}
		})
	}
}
