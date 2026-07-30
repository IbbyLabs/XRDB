package provider

import (
	"context"
	"testing"
)

// A bare TMDB number carries no content type, so it resolves as a movie. That is
// why the configurator emits "tmdb:series:<id>" for a series whose IMDb lookup
// came back empty: the same number names a different title in each bucket, and
// a bare id would render the movie.
func TestBareTMDBIDResolvesAsAMovieAndTheSchemeCarriesTheType(t *testing.T) {
	tm := &TMDB{}
	for _, tc := range []struct {
		id       string
		wantID   string
		wantType string
	}{
		{"1396", "1396", "movie"},
		{"tmdb:1396", "1396", "movie"},
		{"tmdb:movie:1396", "1396", "movie"},
		{"tmdb:series:1396", "1396", "tv"},
		{"tmdb:tv:1396", "1396", "tv"},
		{"series:1396", "1396", "tv"},
	} {
		gotID, gotType, err := tm.resolveID(context.Background(), "", tc.id)
		if err != nil {
			t.Fatalf("resolveID(%q): %v", tc.id, err)
		}
		if gotID != tc.wantID || gotType != tc.wantType {
			t.Errorf("resolveID(%q) = (%q, %q), want (%q, %q)",
				tc.id, gotID, gotType, tc.wantID, tc.wantType)
		}
	}
}
