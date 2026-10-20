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

const v2CredentialConfig = `{"language":"en","tmdbKey":"tmdb-secret","poster":{"mdblistKey":"mdb-secret","ratings":["imdb"]}}`

func saveV2Profile(t *testing.T, store *profile.Store, id, password string) {
	t.Helper()
	if err := store.Save(&profile.Profile{ID: id, Type: "poster", Config: json.RawMessage(v2CredentialConfig)}); err != nil {
		t.Fatal(err)
	}
	if password != "" {
		if err := store.SetPassword(id, password); err != nil {
			t.Fatal(err)
		}
	}
}

func getBody(h http.Handler, path, password string) string {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if password != "" {
		req.Header.Set("X-Profile-Password", password)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr.Body.String()
}

func TestPasswordlessProfileReadsOmitV2Credentials(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	saveV2Profile(t, store, "open01", "")

	for _, path := range []string{"/profile/open01", "/profile/open01/export"} {
		body := getBody(h, path, "")
		if strings.Contains(body, "secret") {
			t.Errorf("%s returned a v2 credential: %s", path, body)
		}
		if !strings.Contains(body, `"language":"en"`) || !strings.Contains(body, `"ratings":["imdb"]`) {
			t.Errorf("%s dropped ordinary config keys: %s", path, body)
		}
	}
}

func TestPasswordedProfileReadsKeepV2CredentialsForTheOwner(t *testing.T) {
	store := openTestStore(t)
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	saveV2Profile(t, store, "locked01", "pw")

	for _, path := range []string{"/profile/locked01", "/profile/locked01/export"} {
		if body := getBody(h, path, "pw"); !strings.Contains(body, "tmdb-secret") || !strings.Contains(body, "mdb-secret") {
			t.Errorf("%s hid the owner's own config from them: %s", path, body)
		}
	}
}
