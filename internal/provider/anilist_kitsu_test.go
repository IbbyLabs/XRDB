package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// AniList publishes averageScore as a percentage, so the tenth it is divided by
// is an assumption about the upstream payload rather than anything the response
// states. Nothing else asserts it, and a rating on the wrong scale still draws
// a badge.
func TestAniListScoreIsAPercentage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"Media": map[string]any{
					"title":        map[string]any{"english": "Attack on Titan"},
					"averageScore": 84,
					"genres":       []string{"Action", "Drama"},
					"startDate":    map[string]any{"year": 2013},
				},
			},
		})
	}))
	defer srv.Close()

	a := &AniList{baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := a.Fetch(context.Background(), "series", "al:16498")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(meta.Ratings) == 0 {
		t.Fatal("no AniList rating parsed, so the scale below is untested")
	}
	got := meta.Ratings[0]
	if got.Value != 8.4 {
		t.Errorf("averageScore 84 became %v, want 8.4", got.Value)
	}
	if got.Label != "8.4" {
		t.Errorf("label = %q, want \"8.4\"", got.Label)
	}
	if got.Value > 10 {
		t.Errorf("rating %v is off the 0-10 scale the badge draws on", got.Value)
	}
}

// Kitsu sends averageRating as a percentage in a string, so both the parse and
// the scale are assumptions. A value arriving already out of ten would pass
// through as a tenth of itself, which is how the SIMKL rating went wrong.
func TestKitsuRatingIsAPercentageString(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"attributes": map[string]any{
					"canonicalTitle": "Cowboy Bebop",
					"averageRating":  "82.51",
					"posterImage":    map[string]any{"original": "https://example.test/p.jpg"},
				},
			},
		})
	}))
	defer srv.Close()

	k := &Kitsu{baseURL: srv.URL + "/", httpClient: srv.Client()}
	meta, err := k.Fetch(context.Background(), "series", "kitsu:1")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(meta.Ratings) == 0 {
		t.Fatal("no Kitsu rating parsed, so the scale below is untested")
	}
	got := meta.Ratings[0]
	if got.Value < 8.24 || got.Value > 8.26 {
		t.Errorf("averageRating \"82.51\" became %v, want about 8.25", got.Value)
	}
	if got.Value > 10 {
		t.Errorf("rating %v is off the 0-10 scale the badge draws on", got.Value)
	}
}
