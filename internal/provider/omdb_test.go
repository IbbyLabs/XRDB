package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOMDBName(t *testing.T) {
	o := NewOMDB("key")
	if o.Name() != "omdb" {
		t.Errorf("Name() = %q, want omdb", o.Name())
	}
}

func TestOMDBNoKey(t *testing.T) {
	o := NewOMDB("")
	_, err := o.Fetch(context.Background(), "movie", "tt0468569")
	if err == nil {
		t.Error("expected error when no API key configured")
	}
}

func TestOMDBNonIMDbID(t *testing.T) {
	o := NewOMDB("key")
	_, err := o.Fetch(context.Background(), "movie", "12345")
	if err == nil {
		t.Error("expected error for non-IMDb ID")
	}
}

func TestOMDBParsesRatings(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"Response": "True",
			"Ratings": []map[string]string{
				{"Source": "Internet Movie Database", "Value": "9.0/10"},
				{"Source": "Rotten Tomatoes", "Value": "85%"},
				{"Source": "Metacritic", "Value": "74/100"},
			},
		})
	}))
	defer srv.Close()

	o := &OMDB{apiKey: "test", httpClient: srv.Client(), baseURL: srv.URL + "/"}
	meta, err := o.Fetch(context.Background(), "movie", "tt0468569")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(meta.Ratings) != 3 {
		t.Errorf("expected 3 ratings, got %d", len(meta.Ratings))
	}

	// Verify per-source values are correctly parsed and scaled.
	ratingsBySource := make(map[string]float64, len(meta.Ratings))
	for _, r := range meta.Ratings {
		ratingsBySource[r.Source] = r.Value
	}
	if v := ratingsBySource["imdb"]; v < 8.9 || v > 9.1 {
		t.Errorf("imdb rating = %v, want ~9.0", v)
	}
	if v := ratingsBySource["rt"]; v < 8.4 || v > 8.6 {
		t.Errorf("rt rating = %v, want ~8.5", v)
	}
	if v := ratingsBySource["metacritic"]; v < 7.3 || v > 7.5 {
		t.Errorf("metacritic rating = %v, want ~7.4", v)
	}

	// Test parsePercent
	if v := parsePercent("85%"); v < 8.4 || v > 8.6 {
		t.Errorf("parsePercent(85%%) = %v, want ~8.5", v)
	}
	if v := parsePercent("N/A"); v >= 0 {
		t.Errorf("parsePercent(N/A) should return -1, got %v", v)
	}

	// Test parseSlashScore
	if v := parseSlashScore("9.0/10"); v < 8.9 || v > 9.1 {
		t.Errorf("parseSlashScore(9.0/10) = %v, want ~9.0", v)
	}
	if v := parseSlashScore("74/100"); v < 7.3 || v > 7.5 {
		t.Errorf("parseSlashScore(74/100) = %v, want ~7.4", v)
	}
	if v := parseSlashScore("N/A"); v >= 0 {
		t.Errorf("parseSlashScore(N/A) should return -1, got %v", v)
	}
}

func TestOMDBHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	o := &OMDB{apiKey: "bad", httpClient: srv.Client(), baseURL: srv.URL + "/"}
	_, err := o.Fetch(context.Background(), "movie", "tt0468569")
	if err == nil {
		t.Error("expected error for HTTP 401 response")
	}
}

func TestOMDBAPIErrorResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"Response": "False",
			"Error":    "Movie not found!",
		})
	}))
	defer srv.Close()

	o := &OMDB{
		apiKey:     "test",
		httpClient: srv.Client(),
		baseURL:    srv.URL + "/",
	}
	_, err := o.Fetch(context.Background(), "movie", "tt9999999")
	if err == nil {
		t.Error("expected error for OMDB API error response")
	}
}

func TestOMDBImplementsProvider(t *testing.T) {
	var _ Provider = NewOMDB("key")
}
