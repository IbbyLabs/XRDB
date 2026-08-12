package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
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
		// AIOMetadata's {type}:{id} produces the tokens in this order when {id}
		// already carries the scheme. Stripping them in a fixed order left the
		// scheme embedded and the id 404d as a literal.
		{"series:tmdb:1396", "1396", "tv"},
		{"movie:tmdb:1396", "1396", "movie"},
		{"tmdb:series:tmdb:1396", "1396", "tv"},
	} {
		gotID, gotType, _, err := tm.resolveID(context.Background(), "", tc.id)
		if err != nil {
			t.Fatalf("resolveID(%q): %v", tc.id, err)
		}
		if gotID != tc.wantID || gotType != tc.wantType {
			t.Errorf("resolveID(%q) = (%q, %q), want (%q, %q)",
				tc.id, gotID, gotType, tc.wantID, tc.wantType)
		}
	}
}

// A composite id can carry an external id after its content-type token. Testing
// for the tt prefix before stripping the token left "series:tt0903747" to be
// read as a TMDB number, which names a different title or nothing at all.
func TestATokenPrefixedIMDbIDIsStillResolvedAsAnIMDbID(t *testing.T) {
	var asked []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = append(asked, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"tv_results":[{"id":1396,"name":"Breaking Bad","popularity":9}]}`))
	}))
	defer srv.Close()

	for _, id := range []string{"series:tt0903747", "tmdb:series:tt0903747", "tt0903747"} {
		tm := NewTMDB("key", "")
		tm.baseURL = srv.URL
		asked = nil

		gotID, gotType, _, err := tm.resolveID(context.Background(), "", id)
		if err != nil {
			t.Fatalf("resolveID(%q): %v", id, err)
		}
		if len(asked) == 0 {
			t.Errorf("resolveID(%q) never called the find endpoint, so the tt id was read as a TMDB number", id)
			continue
		}
		if !strings.Contains(asked[0], "tt0903747") {
			t.Errorf("resolveID(%q) looked up %q, want the tt id", id, asked[0])
		}
		if gotID != "1396" || gotType != "tv" {
			t.Errorf("resolveID(%q) = (%q, %q), want (\"1396\", \"tv\")", id, gotID, gotType)
		}
	}
}
