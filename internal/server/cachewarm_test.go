package server

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/warm"
)

func warmAddon(t *testing.T) *httptest.Server {
	t.Helper()
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest.json":
			_, _ = w.Write([]byte(`{"catalogs":[{"type":"movie","id":"top"}]}`))
		case "/catalog/movie/top.json":
			_, _ = w.Write([]byte(`{"metas":[{"id":"tt1"},{"id":"tt2"},{"id":"tt3"}]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(s.Close)
	return s
}

// The warm pass has to reach the catalogue and come back with its titles; a
// pass that quietly finds nothing is the failure this guards.
func TestWarmCataloguesCollectsTitlesPerSurface(t *testing.T) {
	addon := warmAddon(t)
	cw := config.CacheWarm{
		PostersURL: addon.URL + "/manifest.json",
		LogosURL:   addon.URL + "/manifest.json",
		MaxItems:   2,
	}

	// A nil pipeline stops before any render is attempted, so this measures the
	// catalogue read and the per-surface routing rather than the renderer.
	got := warmCatalogues(context.Background(), cw, &warm.Client{}, nil, nil, nil,
		slog.New(slog.DiscardHandler))

	if got["poster"] != 2 {
		t.Errorf("poster titles = %d, want 2 (the configured cap)", got["poster"])
	}
	if got["logo"] != 2 {
		t.Errorf("logo titles = %d, want 2", got["logo"])
	}
	if _, ok := got["backdrop"]; ok {
		t.Error("an unconfigured surface was warmed")
	}
}

// An addon that is down must not stop the surfaces that are up.
func TestWarmCataloguesSkipsAnAddonThatFails(t *testing.T) {
	addon := warmAddon(t)
	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer dead.Close()

	cw := config.CacheWarm{
		PostersURL:   addon.URL + "/manifest.json",
		BackdropsURL: dead.URL + "/manifest.json",
		MaxItems:     10,
	}
	got := warmCatalogues(context.Background(), cw, &warm.Client{}, nil, nil, nil,
		slog.New(slog.DiscardHandler))

	if got["poster"] != 3 {
		t.Errorf("the healthy surface was not warmed: %v", got)
	}
	if _, ok := got["backdrop"]; ok {
		t.Error("a failing addon reported titles")
	}
}

// Warming is opt-in: an unconfigured or disabled instance must start nothing.
func TestStartCacheWarmScheduleStaysOffUnlessAskedFor(t *testing.T) {
	addon := warmAddon(t)
	cases := map[string]config.CacheWarm{
		"disabled":    {Enabled: false, PostersURL: addon.URL + "/manifest.json", MaxItems: 5},
		"no surfaces": {Enabled: true, MaxItems: 5},
	}
	for name, cw := range cases {
		// Nil pipeline and cache: if the schedule started it would panic on use,
		// so returning cleanly is the assertion.
		StartCacheWarmSchedule(context.Background(), config.Config{CacheWarm: cw},
			nil, nil, slog.New(slog.DiscardHandler))
		t.Logf("%s: returned without starting", name)
	}
}
