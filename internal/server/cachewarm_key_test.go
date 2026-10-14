package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
)

// What the warmer stores is what a plain render URL looks up: an entry put
// under the warm key is served as a cache hit through the real handler.
func TestAWarmedRenderIsWhatTheURLHits(t *testing.T) {
	store := openTestStore(t)
	plain := &profile.Profile{ID: "warmplain", Alias: "warmlook", Type: "poster",
		Config: json.RawMessage(`{"language":"ja"}`)}
	keyed := &profile.Profile{ID: "warmkeyed", Type: "poster", Config: json.RawMessage(`{"language":"de"}`),
		ProviderKeys: map[string]string{provider.KeyTMDB: strings.Repeat("ab", 16)}}
	for _, p := range []*profile.Profile{plain, keyed} {
		if err := store.Save(p); err != nil {
			t.Fatalf("save %s: %v", p.ID, err)
		}
	}
	pipeline, _ := panelPipeline(t, "tmdb")

	cases := []struct {
		name, defaultProfile, warmProfile, url string
	}{
		{"built-in default", "", "", "/poster/tt0111161.jpg"},
		{"named by alias", "", "warmlook", "/poster/tt0111161.jpg?config=warmlook"},
		{"named by id, URL by alias", "", "warmplain", "/poster/tt0111161.jpg?config=warmlook"},
		{"instance default profile", "warmplain", "", "/poster/tt0111161.jpg"},
		{"profile with its own keys", "", "warmkeyed", "/poster/tt0111161.jpg?config=warmkeyed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rc, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
			if err != nil {
				t.Fatalf("render cache: %v", err)
			}
			t.Cleanup(func() { rc.Close() })
			target, err := resolveWarmTarget(store, tc.defaultProfile, tc.warmProfile, "poster")
			if err != nil {
				t.Fatalf("resolve: %v", err)
			}
			sentinel := []byte("\x89PNG\r\n\x1a\nwarmed")
			if err := rc.SetWithTTL(target.cacheKey("poster", "tt0111161"), sentinel, time.Hour); err != nil {
				t.Fatalf("seed: %v", err)
			}
			h := NewHandler("test", store, nil, pipeline, rc, config.Config{DefaultProfile: tc.defaultProfile})
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, tc.url, nil))
			if rr.Header().Get("X-Cache") != "HIT" || rr.Body.String() != string(sentinel) {
				t.Errorf("%s missed the warmed entry: status %d, X-Cache %q, key %s",
					tc.url, rr.Code, rr.Header().Get("X-Cache"), rr.Header().Get("X-Cache-Key"))
			}
		})
	}
}

// A profile that does not exist is reported, not warmed as the default under
// a key no request uses.
func TestAWarmProfileThatDoesNotExistIsAnError(t *testing.T) {
	if _, err := resolveWarmTarget(openTestStore(t), "", "nosuchprofile", "poster"); err == nil {
		t.Fatal("an unknown warm profile resolved")
	}
}
