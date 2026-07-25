package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
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
