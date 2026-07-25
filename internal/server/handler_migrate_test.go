package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
)

func migratePost(t *testing.T, input string) (int, map[string]json.RawMessage) {
	t.Helper()
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	body, _ := json.Marshal(map[string]string{"input": input})
	req := httptest.NewRequest(http.MethodPost, "/api/migrate/config", strings.NewReader(string(body)))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	var out map[string]json.RawMessage
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	return rr.Code, out
}

// The shapes someone actually has to hand.
func TestMigrateAcceptsAV2URL(t *testing.T) {
	code, out := migratePost(t, "https://old.example.com/poster/imdb:tt1.jpg?posterRatings=imdb,tomatoes&lang=en")
	if code != http.StatusOK {
		t.Fatalf("got %d, want 200", code)
	}
	if !strings.Contains(string(out["config"]), `"ratings":["imdb","rt"]`) {
		t.Errorf("ratings not carried: %s", out["config"])
	}
}

func TestMigrateAcceptsABareQueryString(t *testing.T) {
	code, out := migratePost(t, "posterRatings=imdb,tmdb&posterRatingsMax=3")
	if code != http.StatusOK {
		t.Fatalf("got %d, want 200", code)
	}
	if !strings.Contains(string(out["config"]), `"ratingsMax":3`) {
		t.Errorf("cap not carried: %s", out["config"])
	}
}

func TestMigrateAcceptsJSON(t *testing.T) {
	code, out := migratePost(t, `{"posterRatings":"imdb,tomatoes","lang":"en"}`)
	if code != http.StatusOK {
		t.Fatalf("got %d, want 200", code)
	}
	if !strings.Contains(string(out["config"]), `"ratings"`) {
		t.Errorf("ratings not carried: %s", out["config"])
	}
}

func TestMigrateRejectsUnusableInput(t *testing.T) {
	for _, in := range []string{"", "   ", "{not json", "https://example.com/nothing"} {
		if code, _ := migratePost(t, in); code != http.StatusBadRequest {
			t.Errorf("input %q: got %d, want 400", in, code)
		}
	}
}

func TestMigrateRejectsNonPost(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/migrate/config", nil))
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("got %d, want 405", rr.Code)
	}
}
