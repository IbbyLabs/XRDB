package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TMDB's upcoming endpoint answers with films and says so only by being that
// endpoint, so the rows carry no media_type and toTitleResults would drop them.
func TestUpcomingTitlesStampsTheMovieType(t *testing.T) {
	const body = `{"results":[
		{"id":1058424,"title":"Hope","release_date":"2026-09-16"},
		{"id":950387,"title":"Another","release_date":"2026-10-01"}
	]}`
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.RequestURI()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	results, err := NewTMDBAt("key", "", srv.URL).UpcomingTitles(context.Background(), "gb")
	if err != nil {
		t.Fatalf("UpcomingTitles: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("got %d titles, want 2: rows with no media_type were dropped", len(results))
	}
	if results[0].Title != "Hope" || results[0].Year != 2026 || results[0].MediaType != "movie" {
		t.Errorf("first title = %+v, want Hope 2026 movie", results[0])
	}
	if !strings.Contains(gotPath, "region=GB") {
		t.Errorf("requested %q, want the region upper-cased onto the query", gotPath)
	}
}

// No region asks TMDB for its own default rather than sending an empty one.
func TestUpcomingTitlesOmitsAnEmptyRegion(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.RequestURI()
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()

	if _, err := NewTMDBAt("key", "", srv.URL).UpcomingTitles(context.Background(), "  "); err != nil {
		t.Fatalf("UpcomingTitles: %v", err)
	}
	if strings.Contains(gotPath, "region=") {
		t.Errorf("requested %q, want no region parameter", gotPath)
	}
}
