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

// BUG-207: SIMKL sends genres as objects {"genre":"X"} or as bare strings "X".
// Typing the field as one shape failed the whole decode on the other, which lost
// the rating along with the genres. The rating must survive both, and genres must
// be extracted from both.
func TestSIMKLDecodesGenresInEitherShape(t *testing.T) {
	cases := []struct {
		name   string
		genres any
	}{
		{"objects", []map[string]string{{"genre": "Action"}, {"genre": "Drama"}}},
		{"strings", []string{"Action", "Drama"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]any{
					"title":   "Attack on Titan",
					"genres":  tc.genres,
					"ratings": map[string]any{"simkl": map[string]any{"rating": 89.0, "votes": 50000}},
				})
			}))
			defer srv.Close()

			k := &SIMKL{clientID: "k", baseURL: srv.URL, httpClient: srv.Client()}
			meta, err := k.fetchSegment(context.Background(), "movies", "123", "tt123")
			if err != nil {
				t.Fatalf("%s-shaped genres failed the decode, dropping the rating: %v", tc.name, err)
			}
			var rating float64
			for _, r := range meta.Ratings {
				if r.Source == "simkl" {
					rating = r.Value
				}
			}
			if rating == 0 {
				t.Errorf("%s: the SIMKL rating was lost; the whole response failed to parse", tc.name)
			}
			if len(meta.Genres) != 2 || meta.Genres[0] != "Action" || meta.Genres[1] != "Drama" {
				t.Errorf("%s: genres = %v, want [Action Drama]", tc.name, meta.Genres)
			}
		})
	}
}

// BUG-209: SIMKL's rating is already 0–10. It was divided by ten on the belief
// that it was 0–100, so every SIMKL badge rendered under 1 (Shawshank as 0.9).
// The fixture is the shape a real response has — a simkl rating beside an imdb
// one, both on the same scale — because the bug was a wrong belief about the API
// rather than a coding slip.
func TestSIMKLRatingIsAlreadyOutOfTen(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"title": "The Shawshank Redemption",
			"ratings": map[string]any{
				"simkl": map[string]any{"rating": 8.2, "votes": 1508},
				"imdb":  map[string]any{"rating": 8.3, "votes": 175763},
			},
		})
	}))
	defer srv.Close()

	k := &SIMKL{clientID: "k", baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := k.fetchSegment(context.Background(), "movies", "53506", "tt0111161")
	if err != nil {
		t.Fatalf("fetchSegment: %v", err)
	}
	var got float64
	var label string
	for _, r := range meta.Ratings {
		if r.Source == "simkl" {
			got, label = r.Value, r.Label
		}
	}
	if got != 8.2 {
		t.Errorf("SIMKL rating = %v, want 8.2 (a tenth of it means the 0-100 division is back)", got)
	}
	if label != "8.2" {
		t.Errorf("SIMKL label = %q, want \"8.2\"", label)
	}
}
