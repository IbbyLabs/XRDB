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

func resetRequest(h http.Handler, key, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/admin/profile-password-reset", strings.NewReader(body))
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestAdminResetClearsAProfilePasswordAndKeys(t *testing.T) {
	store := openTestStore(t)
	if err := store.Save(&profile.Profile{
		ID: "locked1", Alias: "lockedout", Type: "poster", Config: json.RawMessage(`{}`),
		PasswordHash: mustHash(t, "someone-else"), ProviderKeys: map[string]string{"tmdb": "k"},
	}); err != nil {
		t.Fatal(err)
	}
	h := NewHandler("test", store, nil, nil, nil, config.Config{AdminKey: "admin-k"})

	if rr := resetRequest(h, "", `{"id":"lockedout"}`); rr.Code != http.StatusUnauthorized {
		t.Fatalf("without the admin key: %d, want 401", rr.Code)
	}
	if rr := resetRequest(h, "wrong", `{"id":"lockedout"}`); rr.Code != http.StatusUnauthorized {
		t.Fatalf("with a wrong key: %d, want 401", rr.Code)
	}
	if rr := resetRequest(h, "admin-k", `{"id":"nobody"}`); rr.Code != http.StatusNotFound {
		t.Fatalf("an unknown profile: %d, want 404", rr.Code)
	}
	rr := resetRequest(h, "admin-k", `{"id":"lockedout"}`)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"providerKeysCleared":1`) {
		t.Fatalf("reset by alias: %d %s", rr.Code, rr.Body.String())
	}
	p, err := store.Get("locked1")
	if err != nil {
		t.Fatal(err)
	}
	if p.PasswordHash != "" || len(p.ProviderKeys) != 0 {
		t.Errorf("after reset: password=%q keys=%v, want both cleared", p.PasswordHash, p.ProviderKeys)
	}
}

func TestAdminResetIsOffWithoutAnAdminKey(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	if rr := resetRequest(h, "", `{"id":"x"}`); rr.Code != http.StatusUnauthorized {
		t.Errorf("no admin key configured: %d, want 401", rr.Code)
	}
}
