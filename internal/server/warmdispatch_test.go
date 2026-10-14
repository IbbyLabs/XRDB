package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/warm"
)

// The URLs an addon hands out are the ones its clients request, so warming
// them makes those exact requests hit, whatever shape their ids take.
func TestWarmingAnAddonsArtworkURLsMakesThoseRequestsHit(t *testing.T) {
	store := openTestStore(t)
	if err := store.Save(&profile.Profile{ID: "warmplain", Alias: "warmlook", Type: "poster",
		Config: json.RawMessage(`{"language":"ja"}`)}); err != nil {
		t.Fatalf("save: %v", err)
	}
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{
		Title: "Test", PosterURL: "http://fake/poster.jpg"}})
	pipeline := compose.NewWithFetcher(reg, fixedFetcher{data: testSourcePNG(t, 1000, 1500)})
	rc, err := cache.New(filepath.Join(t.TempDir(), "cache"), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatalf("cache: %v", err)
	}
	t.Cleanup(rc.Close)
	h := NewHandler("test", store, nil, pipeline, rc, config.Config{})

	direct := "/poster/series:tt0903747?config=warmlook&tms=1760000000&v=abc"
	legacy := "/poster/imdb:tt0816692.jpg?config=warmlook&v=abc"
	bareTMDB := "/poster/tmdb:1396?config=warmlook"
	proxied := "/poster/movie:tt0133093?config=warmlook&v=abc"
	metas := []map[string]string{
		{"id": "tt0903747", "poster": "https://xrdb.example" + direct},
		{"id": "tt0816692", "poster": "http://xrdb:3000" + legacy},
		{"id": "tmdb:1396", "poster": "https://xrdb.example" + bareTMDB},
		{"id": "tt0133093", "poster": "https://aiom.example/poster-cache/proxy?url=" + url.QueryEscape("https://xrdb.example"+proxied)},
		{"id": "tt0111161", "poster": "https://image.tmdb.org/t/p/w500/x.jpg"},
	}
	addon := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest.json":
			_, _ = w.Write([]byte(`{"catalogs":[{"type":"series","id":"top"}]}`))
		case "/catalog/series/top.json":
			_ = json.NewEncoder(w).Encode(map[string]any{"metas": metas})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(addon.Close)

	cw := config.CacheWarm{PostersURL: addon.URL + "/manifest.json", MaxItems: 10, Profile: "warmlook"}
	run := warmRun{dispatch: h, resolve: func(surface string) (warmTarget, error) {
		return resolveWarmTarget(store, "", cw.Profile, surface)
	}}
	warmCatalogues(context.Background(), cw, &warm.Client{}, pipeline, rc, newTTLStore(nil),
		slog.New(slog.DiscardHandler), run)

	for _, u := range []string{direct, legacy, bareTMDB, proxied, "/poster/tt0111161?config=warmlook"} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, u, nil))
		if rr.Header().Get("X-Cache") != "HIT" {
			t.Errorf("%s was not warmed: status %d, X-Cache %q", u, rr.Code, rr.Header().Get("X-Cache"))
		}
	}
}

func TestOnlyRenderRoutesForTheSurfaceAreDispatched(t *testing.T) {
	cases := map[string]bool{
		"https://a.example/poster/tt1?config=x":                                                  true,
		"http://xrdb:3000/poster/tt1":                                                            true,
		"https://a.example/backdrop/tt1":                                                         false,
		"https://a.example/api/admin/warm":                                                       false,
		"https://a.example/poster/tt1/extra":                                                     false,
		"https://image.tmdb.org/t/p/w500/x.jpg":                                                  false,
		"https://p.example/proxy?url=" + url.QueryEscape("https://a.example/poster/tt1"):         true,
		"https://p.example/proxy?url=" + url.QueryEscape("https://a.example/api/admin/settings"): false,
		"": false,
	}
	for raw, want := range cases {
		if _, got := warmRenderPath(raw, "poster"); got != want {
			t.Errorf("warmRenderPath(%q) = %v, want %v", raw, got, want)
		}
	}
}

// A warm request queues as a sweep and is marked on its access line; a header
// from outside cannot claim to be one.
func TestAWarmRequestIsASweepAndOnlyTheWarmerCanMakeOne(t *testing.T) {
	var got provider.CallerClass
	var warmSeen bool
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = provider.CallerClassFrom(r.Context())
		warmSeen = isWarmRequest(r.Context())
	})
	h := accessLogMiddleware(slog.New(slog.DiscardHandler), proxyTrust{}, inner)

	if !dispatchWarm(context.Background(), h, "", "/poster/tt1") || got != provider.CallerBulk || !warmSeen {
		t.Errorf("warm dispatch: class %v, marked %v; want bulk and marked", got, warmSeen)
	}
	req := httptest.NewRequest(http.MethodGet, "/poster/tt1", nil)
	req.Header.Set("User-Agent", "Mozilla/5.0")
	req.Header.Set("X-Warm", "true")
	h.ServeHTTP(httptest.NewRecorder(), req)
	if warmSeen {
		t.Error("an outside request was marked as a warm request")
	}
}
