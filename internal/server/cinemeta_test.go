package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStripImdbRatingRemovesBothPlaces(t *testing.T) {
	meta := map[string]any{
		"name":       "Test",
		"imdbRating": "9.3",
		"description": "keep me",
		"links": []any{
			map[string]any{"category": "imdb", "name": "9.3", "url": "https://imdb.com/x"},
			map[string]any{"category": "Cast", "name": "Someone"},
			map[string]any{"category": "Genres", "name": "Drama"},
		},
	}
	out := stripImdbRating(meta)

	if _, ok := out["imdbRating"]; ok {
		t.Error("imdbRating field was not removed")
	}
	if out["description"] != "keep me" {
		t.Error("a non-rating field was lost")
	}
	links := out["links"].([]any)
	if len(links) != 2 {
		t.Fatalf("links = %d, want 2 (imdb dropped)", len(links))
	}
	for _, l := range links {
		if l.(map[string]any)["category"] == "imdb" {
			t.Error("the imdb link survived")
		}
	}
}

func TestStripImdbRatingHandlesMissingLinks(t *testing.T) {
	// No links array, only the field — must not panic.
	out := stripImdbRating(map[string]any{"imdbRating": "8.0", "name": "X"})
	if _, ok := out["imdbRating"]; ok {
		t.Error("imdbRating not removed when there is no links array")
	}
}

func TestFetchCinemetaMeta(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/meta/movie/tt1.json" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte(`{"meta":{"id":"tt1","name":"Test","imdbRating":"9.0","description":"d"}}`))
	}))
	defer s.Close()

	m, err := fetchCinemetaMeta(context.Background(), s.Client(), s.URL, "movie", "tt1")
	if err != nil {
		t.Fatal(err)
	}
	if m["name"] != "Test" || m["description"] != "d" {
		t.Errorf("fields not passed through: %v", m)
	}
	if m["imdbRating"] != "9.0" {
		t.Error("fetch should return the raw meta; stripping is a separate step")
	}
}
