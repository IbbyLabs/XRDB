package server

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime/debug"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/settings"
)

type memLimitResponse struct {
	LimitMB   int64  `json:"limitMb"`
	Source    string `json:"source"`
	Env       string `json:"env"`
	Persisted bool   `json:"persisted"`
}

func memLimitHandler(t *testing.T) (http.Handler, *settings.Store) {
	t.Helper()
	store, err := settings.Open(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatalf("settings.Open: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	// Restore the process default after each test so cases don't leak state.
	t.Cleanup(func() { debug.SetMemoryLimit(math.MaxInt64) })
	debug.SetMemoryLimit(math.MaxInt64)
	cfg := config.Config{AdminKey: "k"}
	return NewHandler("test", nil, store, nil, nil, cfg), store
}

func getMemLimit(t *testing.T, h http.Handler) memLimitResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/memory-limit", nil)
	req.Header.Set("Authorization", "Bearer k")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET memory-limit: %d (%s)", rec.Code, rec.Body.String())
	}
	var out memLimitResponse
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out
}

func putMemLimit(t *testing.T, h http.Handler, key, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/admin/memory-limit", strings.NewReader(body))
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestMemoryLimitPutSetsLiveLimit(t *testing.T) {
	h, _ := memLimitHandler(t)
	if got := getMemLimit(t, h).LimitMB; got != 0 {
		t.Fatalf("initial limit = %d, want 0 (unset)", got)
	}
	if rec := putMemLimit(t, h, "k", `{"limitMb":512}`); rec.Code != http.StatusOK {
		t.Fatalf("PUT: %d (%s)", rec.Code, rec.Body.String())
	}
	if got := debug.SetMemoryLimit(-1); got != 512<<20 {
		t.Errorf("process limit = %d bytes, want %d", got, 512<<20)
	}
	if st := getMemLimit(t, h); st.LimitMB != 512 || st.Source != "stored" {
		t.Errorf("reported state = %+v, want 512/stored", st)
	}
}

func TestMemoryLimitDeleteRevertsToEnv(t *testing.T) {
	t.Setenv("XRDB_MEMORY_LIMIT_MB", "256")
	h, store := memLimitHandler(t)
	putMemLimit(t, h, "k", `{"limitMb":900}`)

	if _, err := store.Get(settings.MemoryLimitKey); err != nil {
		t.Fatalf("value not persisted: %v", err)
	}
	req := httptest.NewRequest(http.MethodDelete, "/api/admin/memory-limit", nil)
	req.Header.Set("Authorization", "Bearer k")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("DELETE: %d", rec.Code)
	}
	if got := debug.SetMemoryLimit(-1); got != 256<<20 {
		t.Errorf("after delete, limit = %d bytes, want env's %d", got, 256<<20)
	}
}

func TestMemoryLimitZeroMeansNoLimit(t *testing.T) {
	h, _ := memLimitHandler(t)
	putMemLimit(t, h, "k", `{"limitMb":512}`)
	if rec := putMemLimit(t, h, "k", `{"limitMb":0}`); rec.Code != http.StatusOK {
		t.Fatalf("PUT 0: %d", rec.Code)
	}
	if got := debug.SetMemoryLimit(-1); got != math.MaxInt64 {
		t.Errorf("limit after 0 = %d, want math.MaxInt64 (no limit)", got)
	}
	if got := getMemLimit(t, h).LimitMB; got != 0 {
		t.Errorf("reported limit = %d, want 0", got)
	}
}

func TestMemoryLimitRejectsInvalid(t *testing.T) {
	h, _ := memLimitHandler(t)
	if rec := putMemLimit(t, h, "k", `{"limitMb":-5}`); rec.Code != http.StatusBadRequest {
		t.Errorf("negative: got %d, want 400", rec.Code)
	}
	if rec := putMemLimit(t, h, "k", `{"limitMb":99999999999999}`); rec.Code != http.StatusBadRequest {
		t.Errorf("overflowing MiB: got %d, want 400", rec.Code)
	}
}

func TestMemoryLimitWriteRequiresAdminKey(t *testing.T) {
	h, _ := memLimitHandler(t)
	if rec := putMemLimit(t, h, "", `{"limitMb":512}`); rec.Code != http.StatusUnauthorized {
		t.Errorf("no key: got %d, want 401", rec.Code)
	}
	if got := debug.SetMemoryLimit(-1); got != math.MaxInt64 {
		t.Errorf("unauthorized request changed the limit: %d", got)
	}
}
