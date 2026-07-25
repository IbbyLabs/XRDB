package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
)

func TestStremioManifest(t *testing.T) {
	h := NewHandler("v1.0", nil, nil, nil, nil, config.Config{Version: "v1.0"})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/manifest.json", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var manifest stremioManifest
	if err := json.NewDecoder(rr.Body).Decode(&manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if manifest.ID == "" {
		t.Error("expected non-empty manifest ID")
	}
	if !contains(manifest.Types, "movie") || !contains(manifest.Types, "series") {
		t.Errorf("expected movie+series types, got %v", manifest.Types)
	}
	if !contains(manifest.Resources, "meta") {
		t.Errorf("expected meta resource, got %v", manifest.Resources)
	}
	if !contains(manifest.IDPrefixes, "tt") {
		t.Errorf("expected tt id prefix, got %v", manifest.IDPrefixes)
	}
}

func TestStremioManifestCORS(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/manifest.json", nil))
	if rr.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("expected CORS header Access-Control-Allow-Origin: *")
	}
}

func TestStremioManifestPreflight(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodOptions, "/stremio/manifest.json", nil))
	if rr.Code != http.StatusNoContent {
		t.Errorf("expected 204 for OPTIONS, got %d", rr.Code)
	}
}

func TestStremioMetaMovie(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/meta/movie/tt0468569.json", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp stremioMetaResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Meta.ID != "tt0468569" {
		t.Errorf("expected id tt0468569, got %q", resp.Meta.ID)
	}
	if resp.Meta.Type != "movie" {
		t.Errorf("expected type movie, got %q", resp.Meta.Type)
	}
	if !strings.Contains(resp.Meta.Poster, "tt0468569") {
		t.Errorf("poster URL %q should contain the id", resp.Meta.Poster)
	}
	if !strings.Contains(resp.Meta.Background, "backdrop") {
		t.Errorf("background URL %q should contain 'backdrop'", resp.Meta.Background)
	}
}

func TestStremioMetaSeries(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/meta/series/tt0944947.json", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var resp stremioMetaResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Meta.Type != "series" {
		t.Errorf("expected series type, got %q", resp.Meta.Type)
	}
}

func TestStremioMetaWithAPIKey(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{APIKey: "secret123"})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/meta/movie/tt1234567.json", nil))

	var resp stremioMetaResponse
	_ = json.NewDecoder(rr.Body).Decode(&resp)
	if !strings.Contains(resp.Meta.Poster, "key=secret123") {
		t.Errorf("expected API key in poster URL, got %q", resp.Meta.Poster)
	}
}

func TestStremioMetaBadPath(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/meta/movie.json", nil))
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad path, got %d", rr.Code)
	}
}

func contains(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}

func TestManifestAdvertisesConfigurable(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/manifest.json", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("manifest: got %d, want 200", rr.Code)
	}
	var manifest struct {
		BehaviorHints struct {
			Configurable bool `json:"configurable"`
		} `json:"behaviorHints"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if !manifest.BehaviorHints.Configurable {
		t.Error("manifest does not advertise configurable, so Stremio shows no Configure button")
	}
}

func TestConfigureRedirectsToTheConfigurator(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/configure", nil))

	if rr.Code != http.StatusFound {
		t.Fatalf("got %d, want 302", rr.Code)
	}
	if loc := rr.Header().Get("Location"); loc != "/configurator" {
		t.Errorf("Location = %q, want /configurator", loc)
	}
}

// A configured install must carry the profile into the artwork URLs, otherwise
// the addon advertises itself as configurable and then ignores the config.
func TestStremioConfiguredMetaCarriesTheProfile(t *testing.T) {
	store := openTestStore(t)
	p := &profile.Profile{ID: "p1", Alias: "mylook", Type: "poster", Config: []byte(`{"size":"normal"}`)}
	if err := store.Save(p); err != nil {
		t.Fatalf("save profile: %v", err)
	}

	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/c/mylook/meta/movie/tt0816692.json", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rr.Code, rr.Body.String())
	}
	var resp struct {
		Meta struct {
			Poster     string `json:"poster"`
			Background string `json:"background"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for name, got := range map[string]string{"poster": resp.Meta.Poster, "background": resp.Meta.Background} {
		if !strings.Contains(got, "config=mylook") {
			t.Errorf("%s URL %q does not carry the profile", name, got)
		}
		if !strings.Contains(got, "v="+p.VersionToken) {
			t.Errorf("%s URL %q does not carry the version token", name, got)
		}
	}
}

// The unconfigured base must keep working exactly as before.
func TestStremioDefaultMetaCarriesNoProfile(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/meta/movie/tt0816692.json", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rr.Code)
	}
	if strings.Contains(rr.Body.String(), "config=") {
		t.Errorf("default meta should carry no profile: %s", rr.Body.String())
	}
}

func TestStremioConfiguredManifestIsServed(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/c/mylook/manifest.json", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rr.Code)
	}
}

// An unknown profile must still render (falling back to the default look)
// rather than breaking the addon for the user.
func TestStremioUnknownProfileStillServesMeta(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/stremio/c/nosuch/meta/movie/tt0816692.json", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rr.Code)
	}
	if strings.Contains(rr.Body.String(), "v=") {
		t.Error("no version token should be emitted for an unresolvable profile")
	}
}
