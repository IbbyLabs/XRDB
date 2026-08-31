package server

import (
	"bytes"
	"context"
	"encoding/json"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/settings"
	"xrdb_rewrite/internal/testutil"
)

func openTestStore(t *testing.T) *profile.Store {
	t.Helper()
	s, err := profile.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open test store: %v", err)
	}
	// Provider credentials are encrypted at rest, so the store needs a key to
	// hold any. A fixed one keeps the tests deterministic.
	if err := s.SetEncryptionKey(strings.Repeat("a1", 32)); err != nil {
		t.Fatalf("set encryption key: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestHealthzOK(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
}

func TestHealthzRejectsPost(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodPost, "/healthz", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rr.Code)
	}
}

func TestRenderPlaceholderOK(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder?type=poster&id=tt0816692&config=compact&uuid=abc123", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("expected valid JSON response: %v", err)
	}
	if payload["status"] != "render-placeholder" {
		t.Fatalf("expected render-placeholder status")
	}
	if payload["cacheKey"] == "" {
		t.Fatalf("expected non-empty cacheKey")
	}
}

func TestRenderPlaceholderRejectsPost(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodPost, "/render-placeholder", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rr.Code)
	}
}

func TestRenderPlaceholderDefaults(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("expected valid JSON response: %v", err)
	}
	if payload["type"] != "poster" {
		t.Fatalf("expected default type poster")
	}
	if payload["id"] != "tt0000000" {
		t.Fatalf("expected default id tt0000000")
	}
}

func TestRenderPlaceholderDecodesQueryValues(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder?type=poster&id=tt0816692&config=mode%3Dcompact%3Byear%3D1&uuid=tenant%2Fblue+team", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("expected valid JSON response: %v", err)
	}
	if payload["type"] != "poster" {
		t.Fatalf("expected type poster")
	}
	if payload["id"] != "tt0816692" {
		t.Fatalf("expected id tt0816692")
	}
	if payload["cacheKey"] == "" {
		t.Fatalf("expected non-empty cacheKey")
	}
}

func TestRenderPlaceholderSimulationMode(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder?type=poster&id=tt0816692&config=compact&uuid=abc123&simulate=1", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("expected valid JSON response: %v", err)
	}
	if payload["simulated"] != true {
		t.Fatalf("expected simulated to be true")
	}
	if payload["simulationLevel"] != "medium" {
		t.Fatalf("expected simulationLevel medium")
	}
	if payload["simulationScore"] == nil {
		t.Fatalf("expected simulationScore field")
	}
}

func TestRenderImagePosterOK(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=compact&uuid=abc123", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	// No pipeline is configured, so this renders a placeholder: a valid PNG with
	// the right headers, served as a non-cacheable 404 (see placeholder handling).
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 placeholder, got %d", rr.Code)
	}
	if cc := rr.Header().Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("placeholder must be non-cacheable, got Cache-Control %q", cc)
	}
	if ct := rr.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("expected Content-Type image/png, got %q", ct)
	}
	if rr.Header().Get("X-Cache-Key") == "" {
		t.Fatal("expected X-Cache-Key header")
	}
	if _, err := png.Decode(bytes.NewReader(rr.Body.Bytes())); err != nil {
		t.Fatalf("expected valid PNG response: %v", err)
	}
}

func TestRenderImageAllFamilies(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	for _, mt := range []string{"poster", "backdrop", "thumbnail", "logo"} {
		req := httptest.NewRequest(http.MethodGet, "/"+mt+"/tt0816692", nil)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		// No pipeline → placeholder, served as a 404 (still a valid PNG).
		if rr.Code != http.StatusNotFound {
			t.Fatalf("%s: expected 404 placeholder, got %d", mt, rr.Code)
		}
		if ct := rr.Header().Get("Content-Type"); ct != "image/png" {
			t.Fatalf("%s: expected Content-Type image/png, got %q", mt, ct)
		}
	}
}

func TestRenderImageInvalidTypeFallsToSPA(t *testing.T) {
	// Invalid media types are no longer API routes; they fall through to the
	// static handler (SPA) which returns 200 with the index page (no embedded UI
	// in tests) or 404 if there's no static handler registered.
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/invalid-type/tt0816692", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	// Without a static FS registered, the mux returns 404 for unknown paths.
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown path (no static FS), got %d", rr.Code)
	}
}

func TestRenderImageRejectsPost(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodPost, "/poster/tt0816692", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rr.Code)
	}
}

func TestRenderImageDeterministic(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=compact&uuid=abc123", nil)
	rr1 := httptest.NewRecorder()
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr1, req)
	h.ServeHTTP(rr2, req)
	if !bytes.Equal(rr1.Body.Bytes(), rr2.Body.Bytes()) {
		t.Fatal("expected deterministic output for same input")
	}
}

func TestRenderImageCacheKeyVariesByInput(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	req1 := httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=compact&uuid=abc123", nil)
	req2 := httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=full&uuid=abc123", nil)
	rr1 := httptest.NewRecorder()
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr1, req1)
	h.ServeHTTP(rr2, req2)
	k1 := rr1.Header().Get("X-Cache-Key")
	k2 := rr2.Header().Get("X-Cache-Key")
	if k1 == k2 {
		t.Fatal("expected different cache keys for different config values")
	}
}

func TestSimulationLevelMapping(t *testing.T) {
	cases := []struct {
		input string
		want  string
		ok    bool
	}{
		{input: "1", want: "medium", ok: true},
		{input: "true", want: "medium", ok: true},
		{input: "medium", want: "medium", ok: true},
		{input: "light", want: "light", ok: true},
		{input: "heavy", want: "heavy", ok: true},
		{input: "0", want: "", ok: false},
	}
	for _, tc := range cases {
		got, ok := simulationLevel(tc.input)
		if ok != tc.ok || got != tc.want {
			t.Fatalf("input %q: expected (%q,%v), got (%q,%v)", tc.input, tc.want, tc.ok, got, ok)
		}
	}
}

func TestProfileCreateAndGet(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	body := `{"id":"p1","type":"poster","config":{"ratings":"imdb"}}`

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(body)))
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST /profile: expected 201, got %d: %s", rr.Code, rr.Body.String())
	}
	var created profile.Profile
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created profile: %v", err)
	}
	if created.ID != "p1" || created.Version != 1 {
		t.Errorf("unexpected created profile: %+v", created)
	}

	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, httptest.NewRequest(http.MethodGet, "/profile/p1", nil))
	if rr2.Code != http.StatusOK {
		t.Fatalf("GET /profile/p1: expected 200, got %d", rr2.Code)
	}
	var got profile.Profile
	if err := json.Unmarshal(rr2.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode get response: %v", err)
	}
	if got.ID != "p1" || got.Type != "poster" {
		t.Errorf("unexpected get response: %+v", got)
	}
}

func TestProfileGetNotFound(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/profile/missing", nil))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rr.Code)
	}
}

func TestProfileCreateConflict(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	body := `{"id":"dup","type":"poster","config":{}}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(body)))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(body)))
	if rr.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d", rr.Code)
	}
}

func TestProfileUpdate(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	create := `{"id":"upd1","type":"poster","config":{"v":1}}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(create)))

	update := `{"name":"Updated","config":{"v":2}}`
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPut, "/profile/upd1", strings.NewReader(update)))
	if rr.Code != http.StatusOK {
		t.Fatalf("PUT /profile/upd1: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var updated profile.Profile
	if err := json.Unmarshal(rr.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode update response: %v", err)
	}
	if updated.Name != "Updated" {
		t.Errorf("expected name='Updated', got %q", updated.Name)
	}
}

func TestProfileUpdateNotFound(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPut, "/profile/ghost", strings.NewReader(`{"config":{}}`)))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rr.Code)
	}
}

func TestProfileExportAndImport(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})

	// create a profile
	createBody := `{"id":"exp1","type":"poster","name":"Export Test","config":{"ratings":["imdb"]}}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(createBody)))

	// export it
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/profile/exp1/export", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("export: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	exportedJSON := rr.Body.String()
	if !strings.Contains(exportedJSON, `"exp1"`) {
		t.Error("export should contain profile id")
	}

	// import into a fresh handler/store
	store2 := openTestStore(t)
	h2 := NewHandler("test", store2, nil, nil, nil, config.Config{})
	rr2 := httptest.NewRecorder()
	h2.ServeHTTP(rr2, httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(exportedJSON)))
	if rr2.Code != http.StatusOK {
		t.Fatalf("import: expected 200, got %d: %s", rr2.Code, rr2.Body.String())
	}
	var res map[string]any
	if err := json.Unmarshal(rr2.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode import result: %v", err)
	}
	if res["imported"] != float64(1) {
		t.Errorf("expected 1 imported, got %v", res["imported"])
	}

	// verify it's in the second store
	rr3 := httptest.NewRecorder()
	h2.ServeHTTP(rr3, httptest.NewRequest(http.MethodGet, "/profile/exp1", nil))
	if rr3.Code != http.StatusOK {
		t.Fatalf("get after import: expected 200, got %d", rr3.Code)
	}
}

func TestProfileExportByAlias(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})

	createBody := `{"id":"exp2","alias":"myalias","type":"poster","name":"Aliased","config":{}}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(createBody)))

	// Export addressed by the alias (not the id) must resolve, like the other routes.
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/profile/myalias/export", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("export by alias: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"exp2"`) {
		t.Error("export by alias should return the underlying profile")
	}
}

func TestProfileImportSkipsDuplicates(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	body := `{"version":1,"profiles":[{"id":"dup","type":"poster","config":{}}]}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(body)))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(body)))
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var res map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res["skipped"] != float64(1) {
		t.Errorf("expected 1 skipped, got %v", res["skipped"])
	}
}

func TestAdminMetricsOK(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{AdminKey: "test-admin-key"})
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil))
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/metrics", nil)
	req.Header.Set("Authorization", "Bearer test-admin-key")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var snap map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &snap); err != nil {
		t.Fatalf("decode metrics: %v", err)
	}
	if snap["totalRequests"] == nil {
		t.Error("expected totalRequests field")
	}
}

func TestAdminCacheOK(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{AdminKey: "test-admin-key"})
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/cache", nil)
	req.Header.Set("Authorization", "Bearer test-admin-key")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
}

func TestAdminSettingsRefreshesTMDBProvider(t *testing.T) {
	t.Setenv("XRDB_TMDB_API_KEY", "env-key")
	t.Setenv("XRDB_TMDB_READ_TOKEN", "")

	dir := t.TempDir()
	settingsStore, err := settings.Open(filepath.Join(dir, "settings.db"))
	if err != nil {
		t.Fatalf("open settings store: %v", err)
	}
	t.Cleanup(func() { _ = settingsStore.Close() })

	var gotAPIKey string
	client := &http.Client{Transport: testutil.RoundTripperFunc(func(req *http.Request) (*http.Response, error) {
		gotAPIKey = req.URL.Query().Get("api_key")
		body := io.NopCloser(strings.NewReader(`{"results":[]}`))
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       body,
			Request:    req,
		}, nil
	})}

	reg := provider.NewRegistry()
	tmdb := provider.NewTMDB("", "")
	tmdb.SetHTTPClient(client)
	reg.Register(tmdb)
	pipeline := compose.New(reg)

	h := NewHandler("test", nil, settingsStore, pipeline, nil, config.Config{AdminKey: "secret"})

	putReq := httptest.NewRequest(http.MethodPut, "/api/admin/settings", strings.NewReader(`{"key":"tmdb_api_key","value":"ui-key"}`))
	putReq.Header.Set("Authorization", "Bearer secret")
	putRR := httptest.NewRecorder()
	h.ServeHTTP(putRR, putReq)
	if putRR.Code != http.StatusNoContent {
		t.Fatalf("expected 204 from settings save, got %d: %s", putRR.Code, putRR.Body.String())
	}

	if _, err := pipeline.TMDBClient().SearchTitles(context.Background(), "matrix"); err != nil {
		t.Fatalf("search after save: %v", err)
	}
	if gotAPIKey != "ui-key" {
		t.Fatalf("expected UI key to be active, got %q", gotAPIKey)
	}

	gotAPIKey = ""
	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/admin/settings?key=tmdb_api_key", nil)
	deleteReq.Header.Set("Authorization", "Bearer secret")
	deleteRR := httptest.NewRecorder()
	h.ServeHTTP(deleteRR, deleteReq)
	if deleteRR.Code != http.StatusNoContent {
		t.Fatalf("expected 204 from settings delete, got %d: %s", deleteRR.Code, deleteRR.Body.String())
	}

	if _, err := pipeline.TMDBClient().SearchTitles(context.Background(), "matrix"); err != nil {
		t.Fatalf("search after delete: %v", err)
	}
	if gotAPIKey != "env-key" {
		t.Fatalf("expected env fallback to be active, got %q", gotAPIKey)
	}
}

func TestProfileStoreUnavailable(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(`{"id":"x","type":"poster","config":{}}`)))
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rr.Code)
	}
}

func TestProfileListEmpty(t *testing.T) {
	// Listing every profile needs the admin key.
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{AdminKey: "sekrit"})
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/profile", nil)
	req.Header.Set("Authorization", "Bearer sekrit")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /profile: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var profiles []profile.Profile
	if err := json.Unmarshal(rr.Body.Bytes(), &profiles); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(profiles) != 0 {
		t.Errorf("expected empty list, got %d profiles", len(profiles))
	}
}

func TestProfileList(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{AdminKey: "sekrit"})
	for _, id := range []string{"a1", "b2", "c3"} {
		body := `{"id":"` + id + `","type":"poster","config":{}}`
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(body)))
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/profile", nil)
	req.Header.Set("Authorization", "Bearer sekrit")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /profile: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var profiles []profile.Profile
	if err := json.Unmarshal(rr.Body.Bytes(), &profiles); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(profiles) != 3 {
		t.Fatalf("expected 3 profiles, got %d", len(profiles))
	}
}

func TestProfileListStoreUnavailable(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/profile", nil))
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rr.Code)
	}
}

// --- Security tests ---

func TestAdminKeyProtectsMetrics(t *testing.T) {
	cfg := config.Config{AdminKey: "secret"}
	h := NewHandler("test", nil, nil, nil, nil, cfg)

	// No key → 401
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/admin/metrics", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("no key: expected 401, got %d", rr.Code)
	}

	// Wrong key → 401
	req := httptest.NewRequest(http.MethodGet, "/api/admin/metrics", nil)
	req.Header.Set("Authorization", "Bearer wrong")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("wrong key: expected 401, got %d", rr.Code)
	}

	// Correct key → 200
	req = httptest.NewRequest(http.MethodGet, "/api/admin/metrics", nil)
	req.Header.Set("Authorization", "Bearer secret")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("correct key: expected 200, got %d", rr.Code)
	}
}

func TestAdminKeyProtectsCache(t *testing.T) {
	cfg := config.Config{AdminKey: "secret"}
	h := NewHandler("test", nil, nil, nil, nil, cfg)

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/admin/cache", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("no key: expected 401, got %d", rr.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/admin/cache", nil)
	req.Header.Set("Authorization", "Bearer secret")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("correct key: expected 200, got %d", rr.Code)
	}
}

func TestAPIKeyProtectsRenderRoutes(t *testing.T) {
	cfg := config.Config{APIKey: "renderkey"}
	h := NewHandler("test", nil, nil, nil, nil, cfg)

	// No key → 401
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("no key: expected 401, got %d", rr.Code)
	}

	// Correct key → passes the gate; no pipeline means a placeholder (404), not 401.
	req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil)
	req.Header.Set("Authorization", "Bearer renderkey")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Errorf("correct key: expected 404 placeholder (gate passed), got %d", rr.Code)
	}
}

// The configurator preview is a same-origin browser <img> that carries no key,
// so the gate must let genuine same-origin requests through while still
// rejecting the server-side and cross-origin fetches the key is meant to block.
func TestAPIKeyExemptsSameOriginPreview(t *testing.T) {
	cfg := config.Config{APIKey: "renderkey"}
	h := NewHandler("test", nil, nil, nil, nil, cfg)

	render := func(setup func(*http.Request)) int {
		req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil)
		if setup != nil {
			setup(req)
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		return rr.Code
	}

	cases := []struct {
		name  string
		setup func(*http.Request)
		want  int
	}{
		// Passing the gate yields a placeholder (404, no pipeline) — the point is
		// it's not 401.
		{"same-origin img preview", func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "same-origin") }, http.StatusNotFound},
		{"same-host referer fallback", func(r *http.Request) { r.Header.Set("Referer", "http://"+r.Host+"/configurator") }, http.StatusNotFound},
		{"cross-site hotlink", func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") }, http.StatusUnauthorized},
		{"same-site neighbour", func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "same-site") }, http.StatusUnauthorized},
		{"direct navigation", func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "none") }, http.StatusUnauthorized},
		{"other-host referer", func(r *http.Request) { r.Header.Set("Referer", "http://evil.example/") }, http.StatusUnauthorized},
		{"server-side fetch (no headers)", nil, http.StatusUnauthorized},
	}
	for _, tc := range cases {
		if got := render(tc.setup); got != tc.want {
			t.Errorf("%s: expected %d, got %d", tc.name, tc.want, got)
		}
	}
}

func TestAPIKeyDoesNotBlockHealthz(t *testing.T) {
	cfg := config.Config{APIKey: "renderkey"}
	h := NewHandler("test", nil, nil, nil, nil, cfg)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rr.Code != http.StatusOK {
		t.Errorf("healthz should not require api key, got %d", rr.Code)
	}
}

func TestProfilePasswordProtection(t *testing.T) {
	store := openTestStore(t)
	// Create a profile
	body := strings.NewReader(`{"id":"locked","type":"poster","config":{}}`)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile", body))
	if rr.Code != http.StatusCreated {
		t.Fatalf("create profile: expected 201, got %d: %s", rr.Code, rr.Body.String())
	}

	// Set a password directly on the store
	if err := store.SetPassword("locked", "mypassword"); err != nil {
		t.Fatalf("SetPassword: %v", err)
	}

	// Rendering with a protected profile stays public: artwork URLs are
	// consumed by media apps that cannot send credentials. The password
	// protects editing, not viewing.
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=locked", nil))
	// Viewing is public (not password-gated); no pipeline means a placeholder 404.
	if rr.Code != http.StatusNotFound {
		t.Errorf("render without password: expected 404 placeholder (not blocked), got %d", rr.Code)
	}

	// Reading the profile config without the password → 401
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/profile/locked", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("profile read without password: expected 401, got %d", rr.Code)
	}

	// Updating without the password → 401
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPut, "/profile/locked",
		strings.NewReader(`{"type":"poster","config":{}}`)))
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("update without password: expected 401, got %d", rr.Code)
	}

	// Deleting without the password → 401
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodDelete, "/profile/locked", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("delete without password: expected 401, got %d", rr.Code)
	}

	// Updating with the correct password → 200
	req := httptest.NewRequest(http.MethodPut, "/profile/locked",
		strings.NewReader(`{"type":"poster","config":{}}`))
	req.Header.Set("X-Profile-Password", "mypassword")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("update with password: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestProfileAliasFlow(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})

	// Create with alias + password, no ID — the server generates one.
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile",
		strings.NewReader(`{"type":"poster","alias":"myhandle","config":{"genre":true},"password":"pw1"}`)))
	if rr.Code != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d: %s", rr.Code, rr.Body.String())
	}
	var created struct {
		ID    string `json:"id"`
		Alias string `json:"alias"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.ID == "" {
		t.Fatal("expected a generated profile ID")
	}
	if created.Alias != "myhandle" {
		t.Fatalf("alias = %q", created.Alias)
	}

	// Render by alias works without a password.
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=myhandle", nil))
	// Alias resolves and reaches the render; no pipeline means a placeholder 404.
	if rr.Code != http.StatusNotFound {
		t.Errorf("render by alias: expected 404 placeholder (alias resolved), got %d", rr.Code)
	}

	// Invalid alias is rejected.
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile",
		strings.NewReader(`{"type":"poster","alias":"Bad-Alias9","config":{}}`)))
	if rr.Code != http.StatusBadRequest {
		t.Errorf("invalid alias: expected 400, got %d", rr.Code)
	}

	// Duplicate alias is rejected.
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile",
		strings.NewReader(`{"type":"poster","alias":"myhandle","config":{}}`)))
	if rr.Code != http.StatusConflict {
		t.Errorf("duplicate alias: expected 409, got %d", rr.Code)
	}
}

// ── effectiveTTL ──────────────────────────────────────────────────────────────

func TestEffectiveTTLNilResult(t *testing.T) {
	if effectiveTTL(nil, newTTLStore(map[string]time.Duration{"tmdb": time.Hour})) != 0 {
		t.Error("expected 0 for nil result")
	}
}

func TestEffectiveTTLNilStore(t *testing.T) {
	result := &compose.Result{ContributingProviders: []string{"tmdb"}}
	if effectiveTTL(result, nil) != 0 {
		t.Error("expected 0 for a nil ttl store")
	}
}

func TestEffectiveTTLEmptyProviders(t *testing.T) {
	result := &compose.Result{}
	if effectiveTTL(result, newTTLStore(map[string]time.Duration{"tmdb": time.Hour})) != 0 {
		t.Error("expected 0 when no contributing providers")
	}
}

func TestEffectiveTTLMinimum(t *testing.T) {
	result := &compose.Result{ContributingProviders: []string{"tmdb", "mdblist"}}
	ttls := newTTLStore(map[string]time.Duration{
		"tmdb":    72 * time.Hour,
		"mdblist": 4 * time.Hour,
	})
	got := effectiveTTL(result, ttls)
	if got != 4*time.Hour {
		t.Errorf("expected 4h (minimum), got %v", got)
	}
}

// ── warmPosters (admin endpoint) ──────────────────────────────────────────────

func TestWarmEndpointMethodNotAllowed(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/admin/warm", nil))
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestWarmEndpointNoPipeline(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{AdminKey: "test-key"})
	rr := httptest.NewRecorder()
	body := strings.NewReader(`{"ids":["tt0468569"],"mediaType":"poster"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/warm", body)
	req.Header.Set("Authorization", "Bearer test-key")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 (no pipeline), got %d", rr.Code)
	}
}

func TestWarmEndpointEmptyIDs(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	body := strings.NewReader(`{"ids":[],"mediaType":"poster"}`)
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/admin/warm", body))
	// 503 because pipeline is nil, but that's caught before ids validation.
	// Test is just verifying no panic.
	if rr.Code == http.StatusOK {
		t.Error("did not expect 200")
	}
}

func TestEffectiveTTLMissingProvider(t *testing.T) {
	result := &compose.Result{ContributingProviders: []string{"tmdb", "unknown"}}
	ttls := newTTLStore(map[string]time.Duration{"tmdb": 24 * time.Hour})
	got := effectiveTTL(result, ttls)
	if got != 24*time.Hour {
		t.Errorf("expected 24h (only known provider), got %v", got)
	}
}

// A profile whose legacy uuid already exists is a re-import under a possibly
// different id; it must be skipped, not duplicated.
func TestProfileImportIsIdempotentByUUID(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})

	first := `{"version":1,"profiles":[{"id":"new-id-1","type":"poster","uuid":"legacy-xyz","config":{}}]}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(first)))

	// Same uuid, different id: the same v2 config re-migrated.
	second := `{"version":1,"profiles":[{"id":"new-id-2","type":"poster","uuid":"legacy-xyz","config":{}}]}`
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(second)))

	var res map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res["skipped"] != float64(1) {
		t.Errorf("expected the duplicate uuid to be skipped, got %v", res["skipped"])
	}
	if res["imported"] != float64(0) {
		t.Errorf("expected 0 imported, got %v", res["imported"])
	}
	// The second id must not have been created.
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, httptest.NewRequest(http.MethodGet, "/profile/new-id-2", nil))
	if rr2.Code != http.StatusNotFound {
		t.Errorf("duplicate-uuid profile was created: got %d", rr2.Code)
	}
}

// Importing v2 profiles into a store that already holds unrelated v3 profiles
// must not touch the existing ones.
func TestProfileImportDoesNotClobberExisting(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})

	// An existing v3 profile with a distinctive config.
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile",
		strings.NewReader(`{"id":"v3-native","type":"poster","config":{"language":"ja"}}`)))

	body := `{"version":1,"profiles":[{"id":"v2-imported","type":"poster","uuid":"u1","config":{"language":"de"}}]}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(body)))

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/profile/v3-native", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("existing profile gone after import: %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), `"ja"`) {
		t.Errorf("existing profile was mutated by import: %s", rr.Body.String())
	}
}

// Saving a non-TMDB provider key through the settings API must activate that
// provider live, proving the credential refresh covers every keyed provider and
// not just TMDB.
func TestSettingsSaveActivatesAnyProviderLive(t *testing.T) {
	settingsStore, err := settings.Open(t.TempDir() + "/s.db")
	if err != nil {
		t.Fatalf("settings.Open: %v", err)
	}
	t.Cleanup(func() { _ = settingsStore.Close() })

	reg := provider.NewRegistry()
	mdb := provider.NewMDBList("") // registered without a key, dormant
	reg.Register(mdb)
	pipeline := compose.New(reg)

	if mdb.HasCredentials() {
		t.Fatal("mdblist should start without credentials")
	}

	h := NewHandler("test", nil, settingsStore, pipeline, nil, config.Config{AdminKey: "secret"})

	put := httptest.NewRequest(http.MethodPut, "/api/admin/settings",
		strings.NewReader(`{"key":"mdblist_api_key","value":"live-key"}`))
	put.Header.Set("Authorization", "Bearer secret")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, put)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("settings save: got %d: %s", rr.Code, rr.Body.String())
	}
	if !mdb.HasCredentials() {
		t.Error("mdblist was not activated by the saved key")
	}

	del := httptest.NewRequest(http.MethodDelete, "/api/admin/settings?key=mdblist_api_key", nil)
	del.Header.Set("Authorization", "Bearer secret")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, del)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("settings delete: got %d", rr.Code)
	}
	if mdb.HasCredentials() {
		t.Error("mdblist should be dormant again after the key is cleared")
	}
}

func TestImportAcceptsABareProfileArray(t *testing.T) {
	// The migration tool used to write a bare array rather than an envelope, so
	// a file produced by an older copy of it still has to import.
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})

	body := `[{"id":"legacy1","type":"poster","config":{"ratings":["imdb"]},"version":1}]`
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(body)))
	if rr.Code != http.StatusOK {
		t.Fatalf("import: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"imported":1`) {
		t.Errorf("expected one profile imported, got %s", rr.Body.String())
	}
	if _, err := store.Get("legacy1"); err != nil {
		t.Errorf("imported profile not stored: %v", err)
	}
}

func TestImportStillRejectsRealRubbish(t *testing.T) {
	// Accepting a second shape must not turn into accepting anything.
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(`"nope"`)))
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for a non-profile body, got %d", rr.Code)
	}
}

func TestImportConvertsAV2ProfileOnTheWayIn(t *testing.T) {
	// A migrating user should be able to post their v2 export at a running
	// instance and have it render, without first running a separate tool they
	// would need a Go toolchain and the source to build.
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})

	v2 := `{"profiles":[{"id":"v2p","type":"poster","config":{
		"posterRatingPreferences":["imdb","tomatoes"],
		"posterRatingsMax":4
	}}]}`
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(v2)))
	if rr.Code != http.StatusOK {
		t.Fatalf("import: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	p, err := store.Get("v2p")
	if err != nil {
		t.Fatalf("stored profile: %v", err)
	}
	cfg := imageconfig.ParseSurface(p.Config, "poster")
	if cfg.RatingsMax == nil || *cfg.RatingsMax != 4 {
		t.Errorf("ratingsMax = %v, want 4 after conversion", cfg.RatingsMax)
	}
	// v2 spelled Rotten Tomatoes differently; unrenamed it would just vanish.
	if len(cfg.Ratings) != 2 || cfg.Ratings[1] != "rt" {
		t.Errorf("ratings = %v, want imdb and rt", cfg.Ratings)
	}
}

func TestProfileImportSkipsDuplicateWithAlias(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	body := `{"version":1,"profiles":[{"id":"dupalias","type":"poster","alias":"myposters","config":{}}]}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(body)))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(body)))
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var res map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res["skipped"] != float64(1) {
		t.Errorf("expected 1 skipped, got %v (errors: %v)", res["skipped"], res["errors"])
	}
	if res["errors"] != nil {
		t.Errorf("expected no errors, got %v", res["errors"])
	}
}

func TestProfileImportRejectsAliasHeldByAnotherProfile(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	first := `{"version":1,"profiles":[{"id":"owner","type":"poster","alias":"shared","config":{}}]}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(first)))
	second := `{"version":1,"profiles":[{"id":"other","type":"poster","alias":"shared","config":{}}]}`
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/profile/import", strings.NewReader(second)))
	var res map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res["skipped"] != float64(0) || res["imported"] != float64(0) {
		t.Fatalf("expected neither imported nor skipped, got %v", res)
	}
	errs, _ := res["errors"].([]any)
	if len(errs) != 1 {
		t.Fatalf("expected one error, got %v", res["errors"])
	}
	msg, _ := errs[0].(string)
	if !strings.Contains(msg, "shared") || !strings.Contains(msg, "other") {
		t.Errorf("error should name the profile and the alias, got %q", msg)
	}
}

// A key supplied only by the environment is live — refreshProviderCredentials
// falls back to it — so the settings read has to report it as set. Reporting it
// unset tells a working install it is broken, and the repair someone reaches for
// is retyping the key into the UI, which moves where their config lives.
func TestAdminSettingsReportsEnvironmentKeys(t *testing.T) {
	t.Setenv("XRDB_MDBLIST_API_KEY", "from-env")
	t.Setenv("XRDB_TMDB_API_KEY", "")
	t.Setenv("XRDB_TMDB_READ_TOKEN", "")
	t.Setenv("XRDB_OMDB_API_KEY", "")
	t.Setenv("XRDB_FANART_API_KEY", "")
	t.Setenv("XRDB_TRAKT_CLIENT_ID", "")
	t.Setenv("XRDB_SIMKL_CLIENT_ID", "")

	dir := t.TempDir()
	settingsStore, err := settings.Open(filepath.Join(dir, "settings.db"))
	if err != nil {
		t.Fatalf("open settings store: %v", err)
	}
	t.Cleanup(func() { _ = settingsStore.Close() })
	if err := settingsStore.Set("omdb_api_key", "from-store"); err != nil {
		t.Fatalf("seed settings store: %v", err)
	}

	h := NewHandler("test", nil, settingsStore, compose.New(provider.NewRegistry()), nil, config.Config{AdminKey: "secret"})

	req := httptest.NewRequest(http.MethodGet, "/api/admin/settings", nil)
	req.Header.Set("Authorization", "Bearer secret")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 from settings read, got %d: %s", rr.Code, rr.Body.String())
	}

	var got []struct {
		Key    string `json:"key"`
		Set    bool   `json:"set"`
		Source string `json:"source"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode settings read: %v", err)
	}
	byKey := make(map[string]struct {
		set    bool
		source string
	}, len(got))
	for _, s := range got {
		byKey[s.Key] = struct {
			set    bool
			source string
		}{s.Set, s.Source}
	}

	for _, want := range []struct {
		key    string
		set    bool
		source string
	}{
		{"mdblist_api_key", true, "environment"},
		{"omdb_api_key", true, "stored"},
		{"tmdb_api_key", false, ""},
	} {
		have, ok := byKey[want.key]
		if !ok {
			t.Fatalf("%s missing from the settings read", want.key)
		}
		if have.set != want.set || have.source != want.source {
			t.Fatalf("%s: got set=%v source=%q, want set=%v source=%q",
				want.key, have.set, have.source, want.set, want.source)
		}
	}
}
