package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
)

var testIDSeq int

// newTestID gives each profile in this file its own id; Save requires one.
func newTestID(t *testing.T) string {
	t.Helper()
	testIDSeq++
	return "keys-test-" + strings.Repeat("0", 2) + string(rune('a'+testIDSeq%26)) + "-" + t.Name()
}

func keysHandler(t *testing.T) (http.Handler, *profile.Store) {
	t.Helper()
	store := openTestStore(t)
	return NewHandler("test", store, nil, nil, nil, config.Config{}), store
}

func putProfile(t *testing.T, h http.Handler, id, body string, password ...string) *httptest.ResponseRecorder {
	t.Helper()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/profile/"+id, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if len(password) > 0 {
		req.Header.Set("X-Profile-Password", password[0])
	}
	h.ServeHTTP(rr, req)
	return rr
}

// An unprotected profile is readable by anyone holding its id, so it must not
// be possible to park an API key on one.
func TestProviderKeysRejectedWithoutAPassword(t *testing.T) {
	h, store := keysHandler(t)
	p := &profile.Profile{ID: newTestID(t), Type: "poster", Config: json.RawMessage(`{}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}

	rr := putProfile(t, h, p.ID, `{"type":"poster","config":{},"providerKeys":{"tmdb":"secret-value"}}`)
	if rr.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "password_required") {
		t.Errorf("response does not name the reason: %s", rr.Body.String())
	}

	stored, err := store.Get(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored.ProviderKeys) != 0 {
		t.Errorf("a key was stored on an unprotected profile: %v", stored.KeysSet)
	}
}

func TestProviderKeysStoredOnAProtectedProfile(t *testing.T) {
	h, store := keysHandler(t)
	p := &profile.Profile{ID: newTestID(t), Type: "poster", Config: json.RawMessage(`{}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPassword(p.ID, "hunter2"); err != nil {
		t.Fatal(err)
	}

	rr := putProfile(t, h, p.ID, `{"type":"poster","config":{},"providerKeys":{"tmdb":"secret-value","mdblist":"other-value"}}`, "hunter2")
	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rr.Code, rr.Body.String())
	}
	stored, err := store.Get(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.ProviderKeys["tmdb"] != "secret-value" {
		t.Errorf("tmdb key not stored: %v", stored.KeysSet)
	}
	if got := strings.Join(stored.KeysSet, ","); got != "mdblist,tmdb" {
		t.Errorf("keysSet = %q, want mdblist,tmdb", got)
	}
}

// The values must never travel outward: the API says which are set, not what
// they are.
func TestProviderKeyValuesAreNeverReturned(t *testing.T) {
	h, store := keysHandler(t)
	p := &profile.Profile{ID: newTestID(t), Type: "poster", Config: json.RawMessage(`{}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPassword(p.ID, "hunter2"); err != nil {
		t.Fatal(err)
	}
	if rr := putProfile(t, h, p.ID, `{"type":"poster","config":{},"providerKeys":{"tmdb":"secret-value"}}`, "hunter2"); rr.Code != http.StatusOK {
		t.Fatalf("put: %d %s", rr.Code, rr.Body.String())
	}

	for _, path := range []string{"/profile/" + p.ID, "/profile/" + p.ID + "/export"} {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("X-Profile-Password", "hunter2")
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("GET %s = %d", path, rr.Code)
		}
		if strings.Contains(rr.Body.String(), "secret-value") {
			t.Errorf("GET %s leaked the key value", path)
		}
		if !strings.Contains(rr.Body.String(), "keysSet") {
			t.Errorf("GET %s does not report which keys are set", path)
		}
	}
}

// Removing the password removes the protection the keys were stored behind, so
// they cannot be left sitting on a now-public profile.
func TestClearingThePasswordClearsTheKeys(t *testing.T) {
	h, store := keysHandler(t)
	p := &profile.Profile{ID: newTestID(t), Type: "poster", Config: json.RawMessage(`{}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPassword(p.ID, "hunter2"); err != nil {
		t.Fatal(err)
	}
	if rr := putProfile(t, h, p.ID, `{"type":"poster","config":{},"providerKeys":{"tmdb":"secret-value"}}`, "hunter2"); rr.Code != http.StatusOK {
		t.Fatalf("put: %d", rr.Code)
	}

	if rr := putProfile(t, h, p.ID, `{"type":"poster","config":{},"password":""}`, "hunter2"); rr.Code != http.StatusOK {
		t.Fatalf("clear password: %d %s", rr.Code, rr.Body.String())
	}
	stored, err := store.Get(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored.ProviderKeys) != 0 {
		t.Errorf("keys survived the password being removed: %v", stored.KeysSet)
	}
}

// Omitting the field leaves what is stored alone; an empty value clears one.
func TestProviderKeysOmittedArePreservedAndBlankClearsOne(t *testing.T) {
	h, store := keysHandler(t)
	p := &profile.Profile{ID: newTestID(t), Type: "poster", Config: json.RawMessage(`{}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPassword(p.ID, "hunter2"); err != nil {
		t.Fatal(err)
	}
	putProfile(t, h, p.ID, `{"type":"poster","config":{},"providerKeys":{"tmdb":"a","mdblist":"b"}}`, "hunter2")

	// Omitted: both survive an unrelated edit.
	if rr := putProfile(t, h, p.ID, `{"type":"poster","config":{"size":"large"}}`, "hunter2"); rr.Code != http.StatusOK {
		t.Fatalf("edit: %d %s", rr.Code, rr.Body.String())
	}
	stored, _ := store.Get(p.ID)
	if len(stored.KeysSet) != 2 {
		t.Errorf("an unrelated edit dropped keys: %v", stored.KeysSet)
	}

	// Blank value clears just that one.
	if rr := putProfile(t, h, p.ID, `{"type":"poster","config":{},"providerKeys":{"tmdb":""}}`, "hunter2"); rr.Code != http.StatusOK {
		t.Fatalf("clear one: %d", rr.Code)
	}
	stored, _ = store.Get(p.ID)
	if got := strings.Join(stored.KeysSet, ","); got != "mdblist" {
		t.Errorf("keysSet = %q, want mdblist", got)
	}
}

// The gate and the storage are only half of it: the owner's credential has to
// reach the provider on their renders, and nobody else's.
func TestOwnerKeyReachesTheProviderOnRender(t *testing.T) {
	store := openTestStore(t)
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	}
	reg := provider.NewRegistry()
	reg.Register(stub)
	pipeline := compose.NewWithFetcher(reg, fixedFetcher{data: testSourcePNG(t, 300, 450)})
	c, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", store, nil, pipeline, c, config.Config{})

	p := &profile.Profile{ID: "reaches-provider", Type: "poster", Config: json.RawMessage(`{}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPassword(p.ID, "pw"); err != nil {
		t.Fatal(err)
	}
	if rr := putProfile(t, h, p.ID, `{"type":"poster","config":{},"providerKeys":{"tmdb":"owner-key"}}`, "pw"); rr.Code != http.StatusOK {
		t.Fatalf("store key: %d %s", rr.Code, rr.Body.String())
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0903747?config="+p.ID, nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("render: %d", rr.Code)
	}
	if stub.SawKey() != "owner-key" {
		t.Errorf("provider saw %q, want the owner's key", stub.SawKey())
	}

	// A render that names no profile must fall back to the server's key.
	stub.SetSawKey("sentinel")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0111161", nil))
	if stub.SawKey() != "" {
		t.Errorf("a profile-less render carried %q", stub.SawKey())
	}
}
