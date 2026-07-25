package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNormalizeLegacyMediaID(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		// The shapes v2 actually served, taken from its request log.
		{"bare imdb id with extension", "tt0816692.jpg", "tt0816692"},
		{"imdb scheme prefix", "imdb:tt0816692", "tt0816692"},
		{"imdb scheme prefix with extension", "imdb:tt0816692.jpg", "tt0816692"},
		{"episode id with extension", "tt0903747:1:1.jpg", "tt0903747:1:1"},
		{"zero padded episode id", "tt11198330:03:07.jpg", "tt11198330:03:07"},
		{"tmdb with content type", "tmdb:movie:27205.jpg", "tmdb:movie:27205"},
		{"tmdb series", "tmdb:tv:1396.jpg", "tmdb:tv:1396"},
		{"png extension", "tt0816692.png", "tt0816692"},
		{"webp extension", "tt0816692.webp", "tt0816692"},
		{"uppercase extension", "tt0816692.JPG", "tt0816692"},

		// Already current — must pass through untouched.
		{"bare imdb id", "tt0816692", "tt0816692"},
		{"episode id", "tt0903747:1:1", "tt0903747:1:1"},
		{"tmdb scheme kept", "tmdb:1396", "tmdb:1396"},
		{"bare numeric", "27205", "27205"},
		{"kitsu id", "kitsu:12345", "kitsu:12345"},
		{"empty", "", ""},

		// A dot that is not an artwork extension carries no meaning here and
		// must survive: stripping it would corrupt the identifier.
		{"unrelated dot", "tt0816692.foo", "tt0816692.foo"},
		{"extension only", ".jpg", ".jpg"},
		{"prefix only", "imdb:", "imdb:"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeLegacyMediaID(tc.in); got != tc.want {
				t.Errorf("normalizeLegacyMediaID(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// keyFor renders path and returns its cache key, which is derived from the id
// the render path actually resolved. Asserting on it rather than on the status
// is deliberate: the test registry answers for any id, so a 200 would be
// returned whether or not the id was normalised.
func keyFor(t *testing.T, h http.Handler, path string) string {
	t.Helper()
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, path, nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("GET %s = %d, want 200", path, rr.Code)
	}
	key := rr.Header().Get("X-Cache-Key")
	if key == "" {
		t.Fatalf("GET %s: no X-Cache-Key; it did not reach the render path", path)
	}
	return key
}

// The point of the shim: a URL configured against v2 resolves the same title as
// the current shape, on every surface. Against the live route an unnormalised
// id yields the "not found" placeholder, which a media app shows as the
// original artwork with no error raised anywhere.
func TestLegacyURLShapesResolveSameAsCurrent(t *testing.T) {
	h := renderingHandler(t)
	cases := []struct{ legacy, current string }{
		{"/poster/tt0816692.jpg", "/poster/tt0816692"},
		{"/poster/imdb:tt0816692", "/poster/tt0816692"},
		{"/poster/imdb:tt0816692.jpg", "/poster/tt0816692"},
		{"/backdrop/tt0816692.jpg", "/backdrop/tt0816692"},
		{"/logo/tt0816692.png", "/logo/tt0816692"},
		{"/thumbnail/tt0903747:1:1.jpg", "/thumbnail/tt0903747:1:1"},
		{"/poster/tmdb:movie:27205.jpg", "/poster/tmdb:movie:27205"},
	}
	for _, tc := range cases {
		if got, want := keyFor(t, h, tc.legacy), keyFor(t, h, tc.current); got != want {
			t.Errorf("%s cache key = %q, want %q (same as %s)", tc.legacy, got, want, tc.current)
		}
	}
}

// A title that differs must still key differently — otherwise the test above
// would pass on a normaliser that collapsed every id to one value.
func TestNormalizationKeepsDistinctTitlesDistinct(t *testing.T) {
	h := renderingHandler(t)
	if a, b := keyFor(t, h, "/poster/tt0816692"), keyFor(t, h, "/poster/tt0903747"); a == b {
		t.Errorf("different titles share cache key %q", a)
	}
}

// The shim rewrites the id, so it must not reach across into the app's own
// routes, which live on the same mux.
func TestLegacyShimLeavesAppRoutesAlone(t *testing.T) {
	h := renderingHandler(t)
	for _, path := range []string{"/healthz", "/readyz", "/api/templates"} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, path, nil))
		if rr.Code != http.StatusOK {
			t.Errorf("GET %s = %d, want 200", path, rr.Code)
		}
	}
}
