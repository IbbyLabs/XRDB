package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// XRDB_JIKAN_URL names the Jikan instance, so a reader supplies the API root.
// The code appends an id to it, so it needs the anime collection and a trailing
// slash. mrkaon set it to the version root on 2026-09-04 and MyAnimeList badges
// silently stopped: every request went to a path built by gluing an id onto
// "/v4", which looks nothing like a rating source failing.
func TestJikanURLAcceptsWhatSomeoneWouldReasonablySet(t *testing.T) {
	const want = "http://jikan_rest:8080/v4/anime/"
	for _, in := range []string{
		"http://jikan_rest:8080/v4",
		"http://jikan_rest:8080/v4/",
		"http://jikan_rest:8080/v4/anime",
		"http://jikan_rest:8080/v4/anime/",
		"  http://jikan_rest:8080/v4  ",
	} {
		if got := normalizeJikanURL(in); got != want {
			t.Errorf("normalizeJikanURL(%q) = %q, want %q", in, got, want)
		}
	}
}

// Unset stays on the public instance rather than becoming a relative path.
func TestAnEmptyJikanURLKeepsThePublicInstance(t *testing.T) {
	if got := normalizeJikanURL(""); got != jikanBaseURL {
		t.Errorf("normalizeJikanURL(%q) = %q, want the public instance", "", got)
	}
	if got := normalizeJikanURL("   "); got != jikanBaseURL {
		t.Errorf("whitespace was not treated as unset: %q", got)
	}
}

// The id is appended to whatever this returns, so the result must always end in
// a separator. A base that does not glues the id onto the last path segment,
// which is the failure this exists to prevent.
//
// A base that is neither the version root nor the collection is left alone but
// for that slash: a proxy on its own path is already complete, and guessing at
// segments would break it the same silent way.
func TestANormalisedJikanURLAlwaysEndsInASlash(t *testing.T) {
	for _, in := range []string{
		"", "http://x", "http://x/", "http://x/v4", "http://x/v4/anime",
		"https://api.jikan.moe/v4", "https://api.jikan.moe/v4/anime/",
	} {
		got := normalizeJikanURL(in)
		if got[len(got)-1] != '/' {
			t.Errorf("normalizeJikanURL(%q) = %q, which would glue the id onto the path", in, got)
		}
	}
}

// End to end, because testing the normaliser alone does not prove anything uses
// it. The client is built with the version root, which is what mrkaon had, and
// the server records the path it was actually asked for.
func TestAVersionRootJikanURLStillReachesTheAnimeEndpoint(t *testing.T) {
	var asked string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = r.URL.Path
		_, _ = w.Write([]byte(`{"data":{"title":"Working","score":8.5,"year":2007}}`))
	}))
	defer srv.Close()

	m := NewMALWithURL(srv.URL + "/v4")
	if _, err := m.Fetch(context.Background(), "series", "mal:20"); err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if asked != "/v4/anime/20" {
		t.Errorf("asked for %q, want /v4/anime/20", asked)
	}
}
