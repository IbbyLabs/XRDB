package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// MAL reports how many users scored a title. Without it the score renders with
// no count and a confidence minimum has nothing to measure (BUG-249).
func TestMALCarriesItsScoredByCount(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{"title": "Naruto", "score": 8.02, "scored_by": 2155085},
		})
	}))
	defer srv.Close()

	m := &MAL{baseURL: srv.URL + "/", httpClient: srv.Client()}
	meta, err := m.Fetch(context.Background(), "series", "mal:20")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(meta.Ratings) != 1 || meta.Ratings[0].Votes != 2155085 {
		t.Errorf("ratings = %+v, want one carrying 2155085 votes", meta.Ratings)
	}
}

// AniList has no single count field. popularity counts list adds, roughly three
// times the number of scores, so the score distribution is summed instead.
func TestAniListSumsItsScoreDistribution(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{"Media": map[string]any{
				"averageScore": 86,
				"stats": map[string]any{"scoreDistribution": []map[string]int{
					{"amount": 100}, {"amount": 205}, {"amount": 5},
				}},
			}},
		})
	}))
	defer srv.Close()

	a := &AniList{baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := a.Fetch(context.Background(), "series", "al:1")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(meta.Ratings) != 1 || meta.Ratings[0].Votes != 310 {
		t.Errorf("ratings = %+v, want one carrying 310 votes", meta.Ratings)
	}
}
