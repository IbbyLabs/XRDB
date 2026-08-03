package server

import (
	"context"
	"encoding/json"
	"errors"
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

// logoFailingFetcher fails the title-logo fetch and serves canned art for
// everything else, so a render comes back real but degraded.
type logoFailingFetcher struct {
	data    []byte
	logoURL string
}

func (f logoFailingFetcher) Fetch(_ context.Context, url string) ([]byte, error) {
	if url == f.logoURL {
		return nil, errors.New("logo fetch failed")
	}
	return f.data, nil
}

// renderLogoPoster renders a textless poster whose config wants the title-logo
// overlay, through a handler with its own render cache, and returns the response
// and that cache.
func renderLogoPoster(t *testing.T, pipeline *compose.Pipeline) (*httptest.ResponseRecorder, *cache.Cache) {
	t.Helper()
	store := openTestStore(t)
	c, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", store, nil, pipeline, c, config.Config{})
	p := &profile.Profile{ID: "logo-cfg", Type: "poster", Config: json.RawMessage(`{"backdropLogo":true}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0111161?config="+p.ID, nil))
	return rr, c
}

func logoStubRegistry() *provider.Registry {
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			Title:          "Test",
			PosterURL:      "http://fake/poster.jpg",
			LogoURL:        "http://fake/logo.png",
			PosterTextless: true,
		},
	}
	reg := provider.NewRegistry()
	reg.Register(stub)
	return reg
}

// A render missing a wanted piece through a transient failure must not be held
// anywhere. It is not stored in our cache and it carries Cache-Control: no-store,
// so a CDN, browser or client cannot freeze one blip for the retention window.
func TestDegradedRenderIsNotStoredAndSaysNoStore(t *testing.T) {
	art := testSourcePNG(t, 300, 450)

	degRR, degCache := renderLogoPoster(t, compose.NewWithFetcher(
		logoStubRegistry(), logoFailingFetcher{data: art, logoURL: "http://fake/logo.png"}))
	if degRR.Code != http.StatusOK {
		t.Fatalf("degraded render: got %d, want 200: %s", degRR.Code, degRR.Body.String())
	}
	if cc := degRR.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("a degraded render must be no-store, got %q", cc)
	}
	if key := degRR.Header().Get("X-Cache-Key"); key != "" {
		if _, ok := degCache.Get(key); ok {
			t.Error("a degraded render was written to the cache")
		}
	}

	// Control: the same render with a working logo fetch is whole, so it caches
	// normally. Without this the assertions above could pass on a render that is
	// never cached for some unrelated reason.
	okRR, okCache := renderLogoPoster(t, compose.NewWithFetcher(
		logoStubRegistry(), fixedFetcher{data: art}))
	if okRR.Code != http.StatusOK {
		t.Fatalf("whole render: got %d, want 200: %s", okRR.Code, okRR.Body.String())
	}
	if cc := okRR.Header().Get("Cache-Control"); !strings.HasPrefix(cc, "public, max-age=") {
		t.Errorf("a whole render should cache normally, got Cache-Control %q", cc)
	}
	if key := okRR.Header().Get("X-Cache-Key"); key != "" {
		if _, ok := okCache.Get(key); !ok {
			t.Error("a whole render was not written to the cache")
		}
	}
}
