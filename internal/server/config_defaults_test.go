package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/imageconfig"
)

// The configurator reads its starting values from this route, so the three
// fields it used to disagree with Go on have to survive the round trip. They
// carry no omitempty, unlike most of the struct, which is what makes that
// possible.
func TestConfigDefaultsCarriesTheFieldsTheConfiguratorDisagreedOn(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/api/config/defaults", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}

	want := imageconfig.Default()
	if got["size"] != string(want.Size) {
		t.Errorf("size = %v, want %q", got["size"], want.Size)
	}
	if got["ageRating"] != want.AgeRating {
		t.Errorf("ageRating = %v, want %v", got["ageRating"], want.AgeRating)
	}
	ratings, ok := got["ratings"].([]any)
	if !ok {
		t.Fatalf("ratings = %v, want a list", got["ratings"])
	}
	if len(ratings) != len(want.Ratings) {
		t.Fatalf("ratings length = %d, want %d", len(ratings), len(want.Ratings))
	}
	// Order is part of the render cache key and is never sorted, so the order
	// here is the assertion rather than the membership.
	for i, r := range want.Ratings {
		if ratings[i] != r {
			t.Errorf("ratings[%d] = %v, want %q", i, ratings[i], r)
		}
	}
}

func TestConfigDefaultsRejectsAnythingButGet(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodPost, "/api/config/defaults", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}
