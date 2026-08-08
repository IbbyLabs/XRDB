package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
)

// refusingRating stands in for a wanted rating source that comes back with a
// rate-limit-shaped error. The error decides which side of the line the render
// falls on.
type refusingRating struct {
	name string
	err  error
}

func (r *refusingRating) Name() string            { return r.name }
func (r *refusingRating) RatingSources() []string { return []string{r.name} }
func (r *refusingRating) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return nil, r.err
}

func renderWithRatingError(t *testing.T, err error) (*httptest.ResponseRecorder, *cache.Cache, string) {
	t.Helper()
	art := testSourcePNG(t, 300, 450)

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	})
	reg.Register(&refusingRating{name: "imdb", err: err})
	pipeline := compose.NewWithFetcher(reg, logoFailingFetcher{data: art})

	store := openTestStore(t)
	c, cerr := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if cerr != nil {
		t.Fatal(cerr)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", store, nil, pipeline, c, config.Config{
		DegradedCacheTTL: 20 * time.Minute,
		HeldOutCacheTTL:  3 * time.Hour,
		CacheTTL:         72 * time.Hour,
	})
	p := &profile.Profile{ID: "held-out-cfg", Type: "poster", Config: json.RawMessage(`{"ratings":["imdb"]}`)}
	if serr := store.Save(p); serr != nil {
		t.Fatal(serr)
	}
	rr := httptest.NewRecorder()
	rq := httptest.NewRequest(http.MethodGet, "/poster/tt0111161?config="+p.ID, nil)
	h.ServeHTTP(rr, rq)
	return rr, c, rr.Header().Get("X-Cache-Key")
}

// A render that lost a badge to this instance's own quota reserve lost nothing
// to a failure. It is complete apart from a source nobody asked, so it is
// stored and served with ordinary freshness headers.
func TestARenderHeldBackByOurOwnGateIsStoredAndCacheable(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
	}{
		{"quota reserve", provider.ErrBulkAllowanceHeld},
		{"pacing queue", provider.ErrPacerBacklog},
		{"budget queue", provider.ErrGovernorBacklog},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rr, c, key := renderWithRatingError(t, tc.err)
			if rr.Code != http.StatusOK {
				t.Fatalf("got %d, want 200: %s", rr.Code, rr.Body.String())
			}
			if cc := rr.Header().Get("Cache-Control"); strings.Contains(cc, "no-store") {
				t.Errorf("a render held back by our own gate was marked no-store: %q", cc)
			}
			if key == "" {
				t.Fatal("no cache key on the response")
			}
			if _, ok := c.Get(key); !ok {
				t.Error("a render held back by our own gate was not stored")
			}
		})
	}
}

// The other side of the same line, which is the one that must not blur: a source
// that refused or failed leaves a render nothing may hold, at any layer.
func TestARenderThatLostASourceToAFailureIsStillNeverStored(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
	}{
		{"the source refused", &provider.RateLimitError{Source: "imdb", Status: 429, RetryAfter: time.Minute}},
		{"cooling off after a refusal", provider.ErrCoolingOff},
		{"held out by the failure breaker", provider.ErrFailureBreaker},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rr, c, key := renderWithRatingError(t, tc.err)
			if rr.Code != http.StatusOK {
				t.Fatalf("got %d, want 200: %s", rr.Code, rr.Body.String())
			}
			if cc := rr.Header().Get("Cache-Control"); cc != "no-store" {
				t.Errorf("Cache-Control = %q, want no-store", cc)
			}
			if key != "" {
				if _, ok := c.Get(key); ok {
					t.Error("a render that lost a source to a failure was stored")
				}
			}
		})
	}
}

// "Only fault" is the whole rule. A render that lost one source to our own gate
// and another to a refusal is a render missing something that broke, and the
// gate it also hit does not redeem it.
func TestOneFailedSourceIsEnoughToKeepARenderOutOfEveryCache(t *testing.T) {
	art := testSourcePNG(t, 300, 450)

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	})
	reg.Register(&refusingRating{name: "imdb", err: provider.ErrBulkAllowanceHeld})
	reg.Register(&refusingRating{name: "tmdb_rating",
		err: &provider.RateLimitError{Source: "tmdb_rating", Status: 429, RetryAfter: time.Minute}})
	pipeline := compose.NewWithFetcher(reg, logoFailingFetcher{data: art})

	store := openTestStore(t)
	c, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", store, nil, pipeline, c, config.Config{
		DegradedCacheTTL: 20 * time.Minute,
		HeldOutCacheTTL:  3 * time.Hour,
		CacheTTL:         72 * time.Hour,
	})
	p := &profile.Profile{ID: "mixed-cfg", Type: "poster",
		Config: json.RawMessage(`{"ratings":["imdb","tmdb_rating"]}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0111161?config="+p.ID, nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rr.Code, rr.Body.String())
	}
	if cc := rr.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", cc)
	}
	if key := rr.Header().Get("X-Cache-Key"); key != "" {
		if _, ok := c.Get(key); ok {
			t.Error("a render that lost a source to a refusal was stored")
		}
	}
}

// The cap a stored held-out render takes is the held-out one, not the shorter
// cap meant for a render that lost a badge to a failure.
func TestAHeldOutRenderTakesTheHeldOutTTL(t *testing.T) {
	ttls := newTTLStore(nil)
	ttls.setDegradedTTL(20 * time.Minute)
	ttls.setHeldOutTTL(3 * time.Hour)

	held := &compose.Result{Degraded: true, DegradedByUs: true}
	if got := effectiveTTL(held, ttls); got != 3*time.Hour {
		t.Errorf("held-out render TTL = %s, want 3h", got)
	}
	failed := &compose.Result{Degraded: true}
	if got := effectiveTTL(failed, ttls); got != 20*time.Minute {
		t.Errorf("failed-source render TTL = %s, want 20m", got)
	}
}

// A rating held back by our own gate does not make the rest of the render
// sound. A title logo that failed to fetch is a failure like any other, and it
// keeps the render out of every cache on its own.
func TestAFailedLogoKeepsARenderOutOfEveryCacheEvenBehindOurOwnGate(t *testing.T) {
	art := testSourcePNG(t, 300, 450)

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			Title: "Test", PosterURL: "http://fake/poster.jpg",
			LogoURL: "http://fake/logo.png", PosterTextless: true,
		},
	})
	reg.Register(&refusingRating{name: "imdb", err: provider.ErrBulkAllowanceHeld})
	pipeline := compose.NewWithFetcher(reg,
		logoFailingFetcher{data: art, logoURL: "http://fake/logo.png"})

	store := openTestStore(t)
	c, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", store, nil, pipeline, c, config.Config{
		DegradedCacheTTL: 20 * time.Minute,
		HeldOutCacheTTL:  3 * time.Hour,
		CacheTTL:         72 * time.Hour,
	})
	p := &profile.Profile{ID: "logo-and-gate", Type: "poster",
		Config: json.RawMessage(`{"ratings":["imdb"],"backdropLogo":true}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0111161?config="+p.ID, nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rr.Code, rr.Body.String())
	}
	if cc := rr.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", cc)
	}
	if key := rr.Header().Get("X-Cache-Key"); key != "" {
		if _, ok := c.Get(key); ok {
			t.Error("a render whose logo fetch failed was stored")
		}
	}
}
