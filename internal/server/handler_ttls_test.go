package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/settings"
)

type ttlEntry struct {
	Provider string  `json:"provider"`
	Hours    float64 `json:"hours"`
	Source   string  `json:"source"`
}

// ttlHandler builds a handler whose ttl store is seeded from a real pipeline
// config, with an admin key and a settings store.
func ttlHandler(t *testing.T) (http.Handler, *settings.Store) {
	t.Helper()
	store, err := settings.Open(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatalf("settings.Open: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	reg := provider.NewRegistry()
	reg.Register(provider.NewTMDB("", ""))
	pipeline := compose.New(reg)
	cfg := config.Config{
		AdminKey: "k",
		CacheTTL: 72 * time.Hour,
		ProviderTTLs: map[string]time.Duration{
			"tmdb":    72 * time.Hour,
			"mdblist": 72 * time.Hour,
		},
	}
	return NewHandler("test", nil, store, pipeline, nil, cfg), store
}

func getTTLs(t *testing.T, h http.Handler) map[string]ttlEntry {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/ttls", nil)
	req.Header.Set("Authorization", "Bearer k")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET ttls: %d (%s)", rec.Code, rec.Body.String())
	}
	var list []ttlEntry
	if err := json.NewDecoder(rec.Body).Decode(&list); err != nil {
		t.Fatalf("decode: %v", err)
	}
	out := map[string]ttlEntry{}
	for _, e := range list {
		out[e.Provider] = e
	}
	return out
}

func TestTTLPutSetsLiveValueAndPersists(t *testing.T) {
	h, store := ttlHandler(t)
	if got := getTTLs(t, h)["tmdb"]; got.Hours != 72 || got.Source != "default" {
		t.Fatalf("initial tmdb = %+v, want 72/default", got)
	}

	body := `{"provider":"tmdb","hours":4}`
	req := httptest.NewRequest(http.MethodPut, "/api/admin/ttls", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer k")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT: %d (%s)", rec.Code, rec.Body.String())
	}

	got := getTTLs(t, h)["tmdb"]
	if got.Hours != 4 || got.Source != "stored" {
		t.Errorf("after PUT tmdb = %+v, want 4/stored", got)
	}
	if v, err := store.Get(settings.TTLKey("tmdb")); err != nil || v != "4" {
		t.Errorf("persisted value = %q (err %v), want 4", v, err)
	}
}

func TestTTLDeleteRevertsToEnvDefault(t *testing.T) {
	h, store := ttlHandler(t)
	// set then clear
	put := httptest.NewRequest(http.MethodPut, "/api/admin/ttls", strings.NewReader(`{"provider":"mdblist","hours":1}`))
	put.Header.Set("Authorization", "Bearer k")
	h.ServeHTTP(httptest.NewRecorder(), put)

	del := httptest.NewRequest(http.MethodDelete, "/api/admin/ttls?provider=mdblist", nil)
	del.Header.Set("Authorization", "Bearer k")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, del)
	if rec.Code != http.StatusOK {
		t.Fatalf("DELETE: %d", rec.Code)
	}
	got := getTTLs(t, h)["mdblist"]
	if got.Hours != 72 || got.Source != "default" {
		t.Errorf("after DELETE mdblist = %+v, want 72/default", got)
	}
	if _, err := store.Get(settings.TTLKey("mdblist")); err == nil {
		t.Error("stored ttl survived the delete")
	}
}

func TestTTLRejectsUnknownProviderAndBadHours(t *testing.T) {
	h, _ := ttlHandler(t)
	put := func(body string) int {
		req := httptest.NewRequest(http.MethodPut, "/api/admin/ttls", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer k")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if put(`{"provider":"nope","hours":4}`) != http.StatusBadRequest {
		t.Error("unknown provider should be 400")
	}
	if put(`{"provider":"tmdb","hours":-1}`) != http.StatusBadRequest {
		t.Error("negative hours should be 400")
	}
	if put(`{"provider":"tmdb","hours":100000}`) != http.StatusBadRequest {
		t.Error("absurd hours should be 400")
	}
}

func TestTTLWriteRequiresAdminKey(t *testing.T) {
	h, _ := ttlHandler(t)
	req := httptest.NewRequest(http.MethodPut, "/api/admin/ttls", strings.NewReader(`{"provider":"tmdb","hours":4}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("no key: got %d, want 401", rec.Code)
	}
}
