package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
)

type keyRecordingProvider struct {
	provider.StubProvider
	sawOwnerKey *bool
}

func (p *keyRecordingProvider) Fetch(ctx context.Context, mediaType, id string) (*provider.MediaMeta, error) {
	if provider.HasOwnerKey(ctx, "tmdb") {
		*p.sawOwnerKey = true
	}
	return p.StubProvider.Fetch(ctx, mediaType, id)
}

func previewHandler(t *testing.T, store *profile.Store, sawKey *bool) http.Handler {
	t.Helper()
	reg := provider.NewRegistry()
	reg.Register(&keyRecordingProvider{
		StubProvider: provider.StubProvider{
			ProviderName: "tmdb",
			Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://fake/p.jpg"},
		},
		sawOwnerKey: sawKey,
	})
	pipeline := compose.NewWithFetcher(reg, fixedFetcher{data: testSourcePNG(t, 800, 1200)})
	c, _ := cache.New(filepath.Join(t.TempDir(), "cache"), time.Hour, 100, 8<<20)
	t.Cleanup(c.Close)
	return NewHandler("test", store, nil, pipeline, c, config.Config{})
}

func openStore(t *testing.T) *profile.Store {
	t.Helper()
	store, err := profile.Open(filepath.Join(t.TempDir(), "profiles.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := store.SetEncryptionKey("0123456789abcdef0123456789abcdef"); err != nil {
		t.Fatal(err)
	}
	return store
}

// The preview must apply a saved profile's provider keys, but only same-origin:
// borrowing another profile's metered key for an arbitrary config would spend it.
func TestPreviewAppliesProfileKeysOnlySameOrigin(t *testing.T) {
	store := openStore(t)
	if err := store.Save(&profile.Profile{
		ID: "abc123", Alias: "myprofile", Type: "poster",
		Config: json.RawMessage(`{}`), ProviderKeys: map[string]string{"tmdb": "owner-tmdb-key"},
	}); err != nil {
		t.Fatal(err)
	}

	var sawKey bool
	h := previewHandler(t, store, &sawKey)

	sawKey = false
	req := httptest.NewRequest(http.MethodGet, "/poster/tt1?config=%7B%7D&pk=myprofile&cb=x1", nil)
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	h.ServeHTTP(httptest.NewRecorder(), req)
	if sawKey {
		t.Error("a cross-origin request borrowed the profile's provider key")
	}

	sawKey = false
	req = httptest.NewRequest(http.MethodGet, "/poster/tt1?config=%7B%7D&pk=myprofile&cb=x2", nil)
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	h.ServeHTTP(httptest.NewRecorder(), req)
	if !sawKey {
		t.Error("the same-origin preview did not apply the profile's provider key")
	}
}

// Adding or changing a provider key changes the render, so it must move the
// cache key even though the profile config bytes are unchanged. This is the
// stale-render bug: a key added to a saved profile was served the pre-key image.
func TestAProviderKeyChangeMovesTheCacheKey(t *testing.T) {
	store := openStore(t)
	var sawKey bool
	h := previewHandler(t, store, &sawKey)

	keyFor := func(alias string) string {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt1?config="+alias, nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("%s: got %d", alias, rr.Code)
		}
		return rr.Header().Get("X-Cache-Key")
	}

	// No keys yet.
	if err := store.Save(&profile.Profile{
		ID: "p1", Alias: "keyless", Type: "poster", Config: json.RawMessage(`{}`),
	}); err != nil {
		t.Fatal(err)
	}
	before := keyFor("keyless")

	// A profile with a key, otherwise identical config.
	if err := store.Save(&profile.Profile{
		ID: "p2", Alias: "keyed", Type: "poster", Config: json.RawMessage(`{}`),
		ProviderKeys: map[string]string{"tmdb": "a-key"},
	}); err != nil {
		t.Fatal(err)
	}
	withKey := keyFor("keyed")

	if before == withKey {
		t.Error("a provider key did not move the cache key, so the pre-key render would be served stale")
	}
}
