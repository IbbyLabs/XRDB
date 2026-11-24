package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/settings"
)

func profileRequest(h http.Handler, method, path, body, password, remoteAddr string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if password != "" {
		req.Header.Set("X-Profile-Password", password)
	}
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestCreatingAProfileRequiresAPassword(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	for _, body := range []string{
		`{"type":"poster","config":{}}`,
		`{"type":"poster","config":{},"password":""}`,
	} {
		rr := profileRequest(h, http.MethodPost, "/profile", body, "", "")
		if rr.Code != http.StatusBadRequest || !strings.Contains(rr.Body.String(), "password is required") {
			t.Errorf("create without a password: %d %q, want 400 saying a password is required", rr.Code, rr.Body.String())
		}
	}
	rr := profileRequest(h, http.MethodPost, "/profile", `{"type":"poster","config":{},"password":"pw"}`, "", "")
	if rr.Code != http.StatusCreated {
		t.Fatalf("create with a password: %d %s", rr.Code, rr.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &created)
	if created["previewToken"] == "" || created["previewToken"] == nil {
		t.Error("a created profile carried no preview token")
	}
	if created["passwordRequired"] != nil {
		t.Error("a profile with a password was flagged as needing one")
	}
}

func TestAProfileWithoutATypeIsABadRequest(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	rr := profileRequest(h, http.MethodPost, "/profile", `{"config":{},"password":"pw"}`, "", "")
	if rr.Code != http.StatusBadRequest || !strings.Contains(rr.Body.String(), "profile type is required") {
		t.Errorf("create without a type: %d %q, want 400 naming the type", rr.Code, rr.Body.String())
	}
}

func TestALegacyPasswordlessProfileStaysEditableAndIsFlagged(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	id := postProfile(t, h, `{"type":"poster","config":{"v":1}}`)

	rr := profileRequest(h, http.MethodGet, "/profile/"+id, "", "", "")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"passwordRequired":true`) {
		t.Fatalf("read: %d %s, want 200 flagged passwordRequired", rr.Code, rr.Body.String())
	}
	rr = profileRequest(h, http.MethodPut, "/profile/"+id, `{"type":"poster","config":{"v":2}}`, "", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("save: %d %s", rr.Code, rr.Body.String())
	}
	var saved map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &saved)
	if saved["passwordRequired"] != true {
		t.Errorf("save response flags: %v, want passwordRequired", saved)
	}

	rr = profileRequest(h, http.MethodPut, "/profile/"+id, `{"type":"poster","config":{"v":3},"password":"newpw"}`, "", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("set a password: %d", rr.Code)
	}
	saved = nil
	_ = json.Unmarshal(rr.Body.Bytes(), &saved)
	if saved["passwordRequired"] != nil {
		t.Error("a profile that now has a password is still flagged")
	}
	if rr := profileRequest(h, http.MethodDelete, "/profile/"+id, "", "", ""); rr.Code != http.StatusUnauthorized {
		t.Errorf("delete without the new password: %d, want 401", rr.Code)
	}
	if rr := profileRequest(h, http.MethodDelete, "/profile/"+id, "", "newpw", ""); rr.Code != http.StatusNoContent {
		t.Errorf("delete with the new password: %d, want 204", rr.Code)
	}
}

func TestProfileCreationIsRateLimitedPerAddress(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	for i := 0; i < profileCreatesPerHour; i++ {
		if rr := profileRequest(h, http.MethodPost, "/profile", `{"type":"poster","config":{},"password":"pw"}`, "", "203.0.113.5:4000"); rr.Code != http.StatusCreated {
			t.Fatalf("create %d: %d %s", i, rr.Code, rr.Body.String())
		}
	}
	rr := profileRequest(h, http.MethodPost, "/profile", `{"type":"poster","config":{},"password":"pw"}`, "", "203.0.113.5:4001")
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("create over the limit: %d, want 429", rr.Code)
	}
	if secs, err := strconv.Atoi(rr.Header().Get("Retry-After")); err != nil || secs < 1 {
		t.Errorf("Retry-After = %q, want positive seconds", rr.Header().Get("Retry-After"))
	}
	if rr := profileRequest(h, http.MethodPost, "/profile", `{"type":"poster","config":{},"password":"pw"}`, "", "203.0.113.6:4000"); rr.Code != http.StatusCreated {
		t.Errorf("another address was refused: %d", rr.Code)
	}
}

func TestProfilePasswordChecksAreRateLimitedPerAddress(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	rr := profileRequest(h, http.MethodPost, "/profile", `{"type":"poster","config":{},"password":"right"}`, "", "198.51.100.1:1")
	var created struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &created)

	const addr = "203.0.113.9:5000"
	for i := 0; i < profilePasswordChecksPerMinute; i++ {
		pw := "wrong"
		want := http.StatusUnauthorized
		if i%2 == 1 {
			pw, want = "right", http.StatusOK
		}
		if rr := profileRequest(h, http.MethodGet, "/profile/"+created.ID, "", pw, addr); rr.Code != want {
			t.Fatalf("check %d: %d, want %d", i, rr.Code, want)
		}
	}
	// The bucket refills while bcrypt runs, so keep asking until it refuses.
	for i := 0; i < 4*profilePasswordChecksPerMinute; i++ {
		rr = profileRequest(h, http.MethodGet, "/profile/"+created.ID, "", "right", addr)
		if rr.Code == http.StatusTooManyRequests {
			break
		}
	}
	if rr.Code != http.StatusTooManyRequests || rr.Header().Get("Retry-After") == "" {
		t.Fatalf("checks past the limit: %d retry-after=%q, want 429 with Retry-After", rr.Code, rr.Header().Get("Retry-After"))
	}
	if rr := profileRequest(h, http.MethodGet, "/profile/"+created.ID, "", "right", "203.0.113.10:5000"); rr.Code != http.StatusOK {
		t.Errorf("another address was refused: %d", rr.Code)
	}
}

func TestThePreviewSecretPersistsInTheSettingsStore(t *testing.T) {
	path := filepath.Join(t.TempDir(), "s.db")
	open := func() *settings.Store {
		ss, err := settings.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = ss.Close() })
		return ss
	}
	token := newPreviewSigner(open(), nil).issue("abc")
	if id, err := newPreviewSigner(open(), nil).verify(token); err != nil || id != "abc" {
		t.Errorf("a token did not verify after the signer was rebuilt: %q %v", id, err)
	}
	if _, err := newPreviewSigner(nil, nil).verify(token); err == nil {
		t.Error("a signer with a different secret accepted the token")
	}
}

func TestAPreviewTokenExpires(t *testing.T) {
	s := newPreviewSigner(nil, nil)
	now := time.Now()
	s.now = func() time.Time { return now }
	token := s.issue("abc")
	s.now = func() time.Time { return now.Add(previewTokenTTL - time.Second) }
	if _, err := s.verify(token); err != nil {
		t.Errorf("a token inside its lifetime was refused: %v", err)
	}
	s.now = func() time.Time { return now.Add(previewTokenTTL + time.Second) }
	if _, err := s.verify(token); err == nil {
		t.Error("an expired token was accepted")
	}
}

func TestProfileImportCountsAgainstTheCreationLimit(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	const addr = "203.0.113.20:7000"
	for i := 0; i < profileCreatesPerHour; i++ {
		body := `{"password":"pw","version":1,"profiles":[{"id":"imp` + strconv.Itoa(i) + `","type":"poster","config":{}}]}`
		rr := profileRequest(h, http.MethodPost, "/profile/import", body, "", addr)
		if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"imported":1`) {
			t.Fatalf("import %d: %d %s, want a profile imported", i, rr.Code, rr.Body.String())
		}
	}
	rr := profileRequest(h, http.MethodPost, "/profile/import", `{"password":"pw","version":1,"profiles":[]}`, "", addr)
	if rr.Code != http.StatusTooManyRequests || rr.Header().Get("Retry-After") == "" {
		t.Fatalf("import over the limit: %d retry-after=%q, want 429 with Retry-After", rr.Code, rr.Header().Get("Retry-After"))
	}
	// One request is one hit however many profiles it carries.
	other := "203.0.113.21:7000"
	many := `{"password":"pw","version":1,"profiles":[{"id":"m1","type":"poster","config":{}},{"id":"m2","type":"poster","config":{}},{"id":"m3","type":"poster","config":{}}]}`
	if rr := profileRequest(h, http.MethodPost, "/profile/import", many, "", other); !strings.Contains(rr.Body.String(), `"imported":3`) {
		t.Errorf("a multi-profile import: %d %s", rr.Code, rr.Body.String())
	}
}

func TestImportRequiresAPasswordPerProfile(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	body := `{"version":1,"password":"shared","profiles":[
		{"id":"own1","type":"poster","config":{},"password":"mine"},
		{"id":"inherits1","type":"poster","config":{}}]}`
	rr := profileRequest(h, http.MethodPost, "/profile/import", body, "", "")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"imported":2`) {
		t.Fatalf("import with passwords: %d %s", rr.Code, rr.Body.String())
	}
	if err := store.CheckPassword("own1", "mine"); err != nil {
		t.Errorf("a profile's own password was not used: %v", err)
	}
	if err := store.CheckPassword("inherits1", "shared"); err != nil {
		t.Errorf("the envelope password was not inherited: %v", err)
	}

	rr = profileRequest(h, http.MethodPost, "/profile/import", `{"version":1,"profiles":[{"id":"bare1","type":"poster","config":{}},{"id":"ok1","type":"poster","config":{},"password":"x"}]}`, "", "")
	var res struct {
		Imported int      `json:"imported"`
		Errors   []string `json:"errors"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	if res.Imported != 1 || len(res.Errors) != 1 || res.Errors[0] != "bare1: a password is required" {
		t.Errorf("import result %+v, want ok1 imported and bare1 refused", res)
	}
	if _, err := store.Get("bare1"); err == nil {
		t.Error("a profile without a password was imported")
	}

	// Nothing imported, so the whole request is unprocessable.
	rr = profileRequest(h, http.MethodPost, "/profile/import", `[{"id":"bare2","type":"poster","config":{}}]`, "", "")
	if rr.Code != http.StatusUnprocessableEntity {
		t.Errorf("import with no password anywhere: %d, want 422", rr.Code)
	}
}
