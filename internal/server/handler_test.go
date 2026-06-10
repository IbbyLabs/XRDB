package server

import (
	"bytes"
	"encoding/json"
	"image/png"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
)

func openTestStore(t *testing.T) *profile.Store {
	t.Helper()
	s, err := profile.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open test store: %v", err)
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

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
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
		if rr.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d", mt, rr.Code)
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
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/admin/metrics", nil))
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
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/admin/cache", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
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
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/profile", nil))
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
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	for _, id := range []string{"a1", "b2", "c3"} {
		body := `{"id":"` + id + `","type":"poster","config":{}}`
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(body)))
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/profile", nil))
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

	// Correct key → 200 (placeholder rendered since no pipeline)
	req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil)
	req.Header.Set("Authorization", "Bearer renderkey")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("correct key: expected 200, got %d", rr.Code)
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

	// Accessing locked profile without password → 401
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=locked", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("no password: expected 401, got %d", rr.Code)
	}

	// With wrong password → 401
	req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=locked", nil)
	req.Header.Set("X-Profile-Password", "wrong")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("wrong password: expected 401, got %d", rr.Code)
	}

	// With correct password via header → 200
	req = httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=locked", nil)
	req.Header.Set("X-Profile-Password", "mypassword")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("correct password header: expected 200, got %d", rr.Code)
	}

	// With correct password via query param → 200
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=locked&password=mypassword", nil))
	if rr.Code != http.StatusOK {
		t.Errorf("correct password query: expected 200, got %d", rr.Code)
	}
}

// ── effectiveTTL ──────────────────────────────────────────────────────────────

func TestEffectiveTTLNilResult(t *testing.T) {
	if effectiveTTL(nil, map[string]time.Duration{"tmdb": time.Hour}) != 0 {
		t.Error("expected 0 for nil result")
	}
}

func TestEffectiveTTLEmptyProviders(t *testing.T) {
	result := &compose.Result{}
	if effectiveTTL(result, map[string]time.Duration{"tmdb": time.Hour}) != 0 {
		t.Error("expected 0 when no contributing providers")
	}
}

func TestEffectiveTTLMinimum(t *testing.T) {
	result := &compose.Result{ContributingProviders: []string{"tmdb", "mdblist"}}
	ttls := map[string]time.Duration{
		"tmdb":    72 * time.Hour,
		"mdblist": 4 * time.Hour,
	}
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
	ttls := map[string]time.Duration{"tmdb": 24 * time.Hour}
	got := effectiveTTL(result, ttls)
	if got != 24*time.Hour {
		t.Errorf("expected 24h (only known provider), got %v", got)
	}
}
