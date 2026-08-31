package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/settings"
)

type levelResponse struct {
	Level     string   `json:"level"`
	Source    string   `json:"source"`
	Levels    []string `json:"levels"`
	Env       string   `json:"env"`
	Persisted bool     `json:"persisted"`
}

func levelHandler(t *testing.T, adminKey string) (http.Handler, *settings.Store) {
	t.Helper()
	store, err := settings.Open(filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("settings.Open: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	t.Cleanup(func() { logging.SetLevel("info") })
	logging.SetLevel("info")
	cfg := config.Config{AdminKey: adminKey, LogLevel: "info"}
	return NewHandler("test", nil, store, nil, nil, cfg), store
}

func getLevel(t *testing.T, h http.Handler, key string) levelResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/log-level", nil)
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET log-level: got %d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	var out levelResponse
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out
}

func putLevel(t *testing.T, h http.Handler, key, level string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/admin/log-level", strings.NewReader(`{"level":"`+level+`"}`))
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestLogLevelPutChangesLiveLevel(t *testing.T) {
	h, _ := levelHandler(t, "s3cret")

	if got := getLevel(t, h, "s3cret").Level; got != "info" {
		t.Fatalf("initial level = %q, want info", got)
	}
	if rec := putLevel(t, h, "s3cret", "debug"); rec.Code != http.StatusOK {
		t.Fatalf("PUT: got %d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	if got := logging.LevelName(); got != "debug" {
		t.Errorf("process level = %q, want debug", got)
	}
	if got := getLevel(t, h, "s3cret").Level; got != "debug" {
		t.Errorf("reported level = %q, want debug", got)
	}
}

func TestLogLevelPutPersistsAndReportsSource(t *testing.T) {
	h, store := levelHandler(t, "s3cret")

	if got := getLevel(t, h, "s3cret").Source; got != "default" {
		t.Errorf("source before any change = %q, want default", got)
	}
	putLevel(t, h, "s3cret", "warn")

	v, err := store.Get(settings.LogLevelKey)
	if err != nil || v != "warn" {
		t.Fatalf("stored level = %q (err %v), want warn", v, err)
	}
	if got := getLevel(t, h, "s3cret").Source; got != "stored" {
		t.Errorf("source after a change = %q, want stored", got)
	}
}

func TestLogLevelDeleteRevertsToConfigured(t *testing.T) {
	h, store := levelHandler(t, "s3cret")
	putLevel(t, h, "s3cret", "error")

	req := httptest.NewRequest(http.MethodDelete, "/api/admin/log-level", nil)
	req.Header.Set("Authorization", "Bearer s3cret")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("DELETE: got %d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	if got := logging.LevelName(); got != "info" {
		t.Errorf("level after delete = %q, want info (the configured value)", got)
	}
	if _, err := store.Get(settings.LogLevelKey); err == nil {
		t.Error("stored level survived the delete")
	}
}

// A stored level folded into cfg at startup must not become the revert target:
// clearing it drops back to the environment, not the value just cleared.
func TestLogLevelDeleteRevertsToEnvironmentNotStored(t *testing.T) {
	t.Setenv("XRDB_LOG_LEVEL", "warn")
	// cfg.LogLevel carries the stored value, mimicking applySettingsOverrides.
	store, err := settings.Open(filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("settings.Open: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	t.Cleanup(func() { logging.SetLevel("info") })
	logging.SetLevel("debug")
	cfg := config.Config{AdminKey: "s3cret", LogLevel: "debug"}
	h := NewHandler("test", nil, store, nil, nil, cfg)

	req := httptest.NewRequest(http.MethodDelete, "/api/admin/log-level", nil)
	req.Header.Set("Authorization", "Bearer s3cret")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("DELETE: got %d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	if got := logging.LevelName(); got != "warn" {
		t.Errorf("level after delete = %q, want warn (the environment value)", got)
	}
}

func TestLogLevelRejectsUnknownLevel(t *testing.T) {
	h, _ := levelHandler(t, "s3cret")
	rec := putLevel(t, h, "s3cret", "loud")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("PUT unknown level: got %d, want 400", rec.Code)
	}
	if got := logging.LevelName(); got != "info" {
		t.Errorf("level changed on a rejected request: %q", got)
	}
}

func TestLogLevelWriteRequiresAdminKey(t *testing.T) {
	h, _ := levelHandler(t, "s3cret")

	if rec := putLevel(t, h, "", "debug"); rec.Code != http.StatusUnauthorized {
		t.Errorf("PUT without a key: got %d, want 401", rec.Code)
	}
	if rec := putLevel(t, h, "wrong", "debug"); rec.Code != http.StatusUnauthorized {
		t.Errorf("PUT with a wrong key: got %d, want 401", rec.Code)
	}
	if got := logging.LevelName(); got != "info" {
		t.Errorf("unauthorised request changed the level: %q", got)
	}
}

// An instance with no admin key configured refuses every method, matching how
// the other admin routes behave. The read used to be open here.
func TestLogLevelRefusedWhenNoAdminKeyConfigured(t *testing.T) {
	h, _ := levelHandler(t, "")

	req := httptest.NewRequest(http.MethodGet, "/api/admin/log-level", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("GET with no key configured: got %d, want 401", rec.Code)
	}
	if rec := putLevel(t, h, "", "debug"); rec.Code != http.StatusUnauthorized {
		t.Errorf("PUT with no key configured: got %d, want 401", rec.Code)
	}
}
