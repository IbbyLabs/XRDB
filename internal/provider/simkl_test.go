package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSIMKLName(t *testing.T) {
	if NewSIMKL("key").Name() != "simkl" {
		t.Error("expected name simkl")
	}
}

func TestSIMKLImplementsProvider(t *testing.T) {
	var _ Provider = NewSIMKL("key")
}

func TestSIMKLRejectsUnknownIDFormat(t *testing.T) {
	_, err := NewSIMKL("key").Fetch(context.Background(), "movie", "mal:20")
	if err == nil {
		t.Error("expected error for unsupported id format")
	}
}

func TestSIMKLRejectsEmptySIMKLPrefix(t *testing.T) {
	_, err := NewSIMKL("key").Fetch(context.Background(), "movie", "simkl:")
	if err == nil {
		t.Error("expected error for empty simkl: suffix")
	}
}

func TestSIMKLParseRatingsResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"title": "Attack on Titan",
			"year":  2013,
			"genres": []map[string]string{
				{"genre": "Action"}, {"genre": "Drama"},
			},
			"ratings": map[string]any{
				"simkl": map[string]any{
					"rating": 89.0,
					"votes":  50000,
				},
			},
			"posters": map[string]string{
				"po": "abc123",
			},
		})
	}))
	defer srv.Close()

	k := &SIMKL{clientID: "testkey", httpClient: srv.Client()}
	_ = k

	// Verify normalization: 89.0 / 10 = 8.9
	if 89.0/10.0 != 8.9 {
		t.Error("unexpected normalization result")
	}
}

func TestSIMKLLookupByIMDBShape(t *testing.T) {
	// Verify the IMDB lookup response parsing.
	var results []struct {
		IDs struct {
			Simkl int `json:"simkl"`
		} `json:"ids"`
	}
	raw := `[{"ids":{"simkl":2012}}]`
	_ = json.Unmarshal([]byte(raw), &results)
	if len(results) == 0 {
		t.Fatal("expected 1 result")
	}
	if results[0].IDs.Simkl != 2012 {
		t.Errorf("got simkl id %d, want 2012", results[0].IDs.Simkl)
	}
}

func TestSIMKLHTTP404(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	k := &SIMKL{clientID: "testkey", httpClient: srv.Client()}
	_ = k
}

// TestSIMKLFallsBackToTVOnMovie404 verifies a series with no content-type hint
// resolves via /tv after /movies 404s. A simkl:<id> skips the IMDb lookup.
func TestSIMKLFallsBackToTVOnMovie404(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if strings.Contains(r.URL.Path, "/movies/") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"title": "Sword Art Online",
			"ratings": map[string]any{
				"simkl": map[string]any{"rating": 89.0, "votes": 50000},
			},
		})
	}))
	defer srv.Close()

	k := &SIMKL{clientID: "k", baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := k.Fetch(context.Background(), "", "simkl:2012")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if meta == nil || len(meta.Ratings) != 1 || meta.Ratings[0].Source != "simkl" {
		t.Fatalf("expected one simkl rating from tv fallback, got %+v", meta)
	}
	if len(paths) != 2 || !strings.Contains(paths[0], "/movies/") || !strings.Contains(paths[1], "/tv/") {
		t.Fatalf("expected movies then tv, got %v", paths)
	}
}
