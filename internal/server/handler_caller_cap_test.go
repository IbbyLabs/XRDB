package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
)

// capHandler builds a handler with a small render cap so the limit is reachable
// in a test.
func capHandler(t *testing.T, perMinute int) (http.Handler, *profile.Profile) {
	t.Helper()
	art := testSourcePNG(t, 300, 450)
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	})
	pipeline := compose.NewWithFetcher(reg, logoFailingFetcher{data: art})

	store := openTestStore(t)
	c, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", store, nil, pipeline, c, config.Config{
		RenderCapPerMinute: perMinute,
		CacheTTL:           72 * time.Hour,
	})
	p := &profile.Profile{ID: "cap-cfg", Type: "poster", Config: json.RawMessage(`{}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	return h, p
}

// A caller past its allowance is refused at the door rather than after the
// render queue, so the refusal costs it nothing to receive. The allowance a
// burst may spend at once is twice the per-minute rate, so a rate of 2 admits
// 4 before it refuses.
func TestACallerPastItsAllowanceIsRefused(t *testing.T) {
	h, p := capHandler(t, 2)

	codes := []int{}
	for i := range 6 {
		rr := httptest.NewRecorder()
		// A distinct title each time so no request is answered from the cache.
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt000"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = "203.0.113.9:1234"
		h.ServeHTTP(rr, req)
		codes = append(codes, rr.Code)
	}
	for i, c := range codes[:4] {
		if c != http.StatusOK {
			t.Fatalf("request %d of the allowance returned %d, want 200 (all: %v)", i+1, c, codes)
		}
	}
	if codes[4] != http.StatusTooManyRequests || codes[5] != http.StatusTooManyRequests {
		t.Errorf("requests past the allowance returned %v, want 429", codes[4:])
	}
}

// The refusal has to say when to come back and must not be held anywhere.
func TestARefusedCallerIsToldWhenToReturn(t *testing.T) {
	h, p := capHandler(t, 1) // burst 2, so the third is refused
	for i := range 3 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt100"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = "203.0.113.10:1234"
		h.ServeHTTP(rr, req)
		if i == 2 {
			if rr.Code != http.StatusTooManyRequests {
				t.Fatalf("got %d, want 429", rr.Code)
			}
			if rr.Header().Get("Retry-After") == "" {
				t.Error("a refusal carried no Retry-After")
			}
			if cc := rr.Header().Get("Cache-Control"); cc != "no-store" {
				t.Errorf("Cache-Control = %q, want no-store", cc)
			}
		}
	}
}

// A warm catalogue reload costs a cache read, not a render, so it is not what
// the cap exists to hold back.
func TestACacheHitIsNotCapped(t *testing.T) {
	h, p := capHandler(t, 1)

	first := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/poster/tt2001?config="+p.ID, nil)
	req.RemoteAddr = "203.0.113.11:1234"
	h.ServeHTTP(first, req)
	if first.Code != http.StatusOK {
		t.Fatalf("the first render returned %d", first.Code)
	}

	for i := range 5 {
		rr := httptest.NewRecorder()
		again := httptest.NewRequest(http.MethodGet, "/poster/tt2001?config="+p.ID, nil)
		again.RemoteAddr = "203.0.113.11:1234"
		h.ServeHTTP(rr, again)
		if rr.Code != http.StatusOK {
			t.Fatalf("cache hit %d returned %d, want 200", i+1, rr.Code)
		}
	}
}

// Zero leaves the cap off entirely, which is what an instance that has never
// configured it runs.
func TestNoCapConfiguredRefusesNothing(t *testing.T) {
	h, p := capHandler(t, 0)
	for i := range 6 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt300"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = "203.0.113.12:1234"
		h.ServeHTTP(rr, req)
		if rr.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d was capped with no cap configured", i+1)
		}
	}
}
