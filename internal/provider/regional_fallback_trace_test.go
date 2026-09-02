package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A request for one country's artwork answered with another's is a substitution
// nobody can see: the render succeeds and looks right. The report it generates
// is "my region setting does nothing".
func regionRender(t *testing.T, language, wantCountry string, posters []map[string]any) []map[string]any {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": 1, "title": "T", "poster_path": "/fallback.jpg",
			"images": map[string]any{"posters": posters},
		})
	}))
	defer srv.Close()

	buf := &bytes.Buffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	tmdb := NewTMDBAt("k", "", srv.URL)
	tmdb.SetHTTPClient(srv.Client())

	_, err := tmdb.FetchArtwork(context.Background(), "movie", "1", ArtworkOptions{
		Language:              language,
		WatchProvidersCountry: wantCountry,
	})
	if err != nil {
		t.Fatalf("render failed: %v", err)
	}

	var out []map[string]any
	for _, line := range strings.Split(buf.String(), "\n") {
		if line == "" {
			continue
		}
		var rec map[string]any
		if json.Unmarshal([]byte(line), &rec) == nil {
			out = append(out, rec)
		}
	}
	return out
}

func substitutionLines(recs []map[string]any) []map[string]any {
	var out []map[string]any
	for _, r := range recs {
		if s, _ := r["msg"].(string); strings.Contains(s, "requested country") {
			out = append(out, r)
		}
	}
	return out
}

func TestASubstitutedCountryIsRecordedWithBothHalves(t *testing.T) {
	recs := regionRender(t, "es", "MX", []map[string]any{
		{"file_path": "/es.jpg", "iso_639_1": "es", "iso_3166_1": "ES", "vote_average": 9.0},
	})
	lines := substitutionLines(recs)
	if len(lines) != 1 {
		t.Fatalf("got %d substitution lines, want one: %v", len(lines), recs)
	}
	line := lines[0]
	if line["requested_country"] != "MX" {
		t.Errorf("requested_country = %v, want MX", line["requested_country"])
	}
	if line["country"] != "ES" {
		t.Errorf("country = %v, want ES", line["country"])
	}
	if line["level"] != "INFO" {
		t.Errorf("level = %v, want INFO — debug is off in production", line["level"])
	}
}

func TestTheRequestedCountryBeingDeliveredIsNotReported(t *testing.T) {
	recs := regionRender(t, "es", "MX", []map[string]any{
		{"file_path": "/mx.jpg", "iso_639_1": "es", "iso_3166_1": "MX", "vote_average": 9.0},
		{"file_path": "/es.jpg", "iso_639_1": "es", "iso_3166_1": "ES", "vote_average": 8.0},
	})
	if lines := substitutionLines(recs); len(lines) != 0 {
		t.Errorf("a satisfied request reported a substitution: %v", lines)
	}
}

// releaseRegion substitutes "US" when nothing is set, so reading the region
// through it would report a substitution against a country nobody asked for.
func TestNoCountryAskedForReportsNothing(t *testing.T) {
	recs := regionRender(t, "es", "", []map[string]any{
		{"file_path": "/es.jpg", "iso_639_1": "es", "iso_3166_1": "ES", "vote_average": 9.0},
	})
	if lines := substitutionLines(recs); len(lines) != 0 {
		t.Errorf("a request naming no country reported a substitution: %v", lines)
	}
}

// A region reaching selection through the language tag is the same substitution
// by a different route, so it needs the same line or the feature reintroduces
// the invisibility it was built beside.
func TestARegionFromTheLanguageTagIsTracedToo(t *testing.T) {
	recs := regionRender(t, "es-mx", "", []map[string]any{
		{"file_path": "/es.jpg", "iso_639_1": "es", "iso_3166_1": "ES", "vote_average": 9.0},
	})
	lines := substitutionLines(recs)
	if len(lines) != 1 {
		t.Fatalf("got %d substitution lines, want one: %v", len(lines), recs)
	}
	if lines[0]["requested_country"] != "MX" {
		t.Errorf("requested_country = %v, want MX from the language tag", lines[0]["requested_country"])
	}
	if lines[0]["country"] != "ES" {
		t.Errorf("country = %v, want ES", lines[0]["country"])
	}
}
