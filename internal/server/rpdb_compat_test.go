package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
)

// The shim exists so moving from RPDB is a hostname swap. These assert the URL
// shapes RPDB actually serves.
func TestRPDBPosterURLRenders(t *testing.T) {
	h := renderingHandler(t)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/mylook/imdb/poster-default/tt0468569.jpg", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rr.Code, rr.Body.String())
	}
	if ct := rr.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("Content-Type = %q, want image/jpeg", ct)
	}
	if rr.Header().Get("X-Cache-Key") == "" {
		t.Error("no X-Cache-Key; the request did not reach the render path")
	}
}

func TestRPDBBackdropURLRenders(t *testing.T) {
	h := renderingHandler(t)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/mylook/imdb/backdrop-default/tt0468569.jpg", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rr.Code)
	}
}

// An RPDB poster style has no XRDB equivalent — the look comes from the profile
// — so it must be accepted and ignored, not 404.
func TestRPDBPosterStyleIsAccepted(t *testing.T) {
	h := renderingHandler(t)
	for _, resource := range []string{"poster-default", "poster-imdb", "poster-rating", "poster"} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/mylook/imdb/"+resource+"/tt1.jpg", nil))
		if rr.Code != http.StatusOK {
			t.Errorf("%s: got %d, want 200", resource, rr.Code)
		}
	}
}

func TestRPDBUnknownResourceIs404(t *testing.T) {
	h := renderingHandler(t)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/mylook/imdb/nonsense-default/tt1.jpg", nil))
	if rr.Code != http.StatusNotFound {
		t.Errorf("got %d, want 404", rr.Code)
	}
}

func TestRPDBMediaID(t *testing.T) {
	for _, tc := range []struct {
		source, raw string
		id, ctype   string
		ok          bool
	}{
		{"imdb", "tt0468569.jpg", "tt0468569", "", true},
		{"imdb", "tt0468569.png", "tt0468569", "", true},
		{"imdb", "tt0468569", "tt0468569", "", true},
		// The TMDB prefix names the content type, which saves the rating
		// providers from guessing movie-vs-series.
		{"tmdb", "movie-155.jpg", "155", "movie", true},
		{"tmdb", "series-1396.jpg", "1396", "series", true},
		{"tmdb", "show-1396.jpg", "1396", "series", true},
		{"tmdb", "155.jpg", "155", "", true},
		{"tmdb", "weird-155.jpg", "weird-155", "", true},
		{"imdb", ".jpg", "", "", false},
		{"other", "tt1.jpg", "", "", false},
	} {
		id, ctype, ok := rpdbMediaID(tc.source, tc.raw)
		if id != tc.id || ctype != tc.ctype || ok != tc.ok {
			t.Errorf("rpdbMediaID(%q,%q) = %q/%q/%v, want %q/%q/%v",
				tc.source, tc.raw, id, ctype, ok, tc.id, tc.ctype, tc.ok)
		}
	}
}

func TestRPDBKind(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want string
		ok   bool
	}{
		{"poster-default", "poster", true},
		{"poster", "poster", true},
		{"backdrop-default", "backdrop", true},
		{"background-default", "backdrop", true},
		{"logo-default", "logo", true},
		{"stream-default", "", false},
		{"", "", false},
	} {
		got, ok := rpdbKind(tc.in)
		if got != tc.want || ok != tc.ok {
			t.Errorf("rpdbKind(%q) = %q/%v, want %q/%v", tc.in, got, ok, tc.want, tc.ok)
		}
	}
}

// The shim must not capture the app's own routes. The Stremio base in
// particular is four segments deep and would collide with a naive pattern.
func TestRPDBShimDoesNotSwallowOtherRoutes(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	for _, path := range []string{
		"/stremio/c/mylook/manifest.json",
		"/stremio/manifest.json",
		"/healthz",
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, path, nil))
		if rr.Code != http.StatusOK {
			t.Errorf("%s: got %d, want 200 — the shim captured it", path, rr.Code)
		}
	}
}

func TestRPDBRejectsNonGET(t *testing.T) {
	h := renderingHandler(t)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/mylook/imdb/poster-default/tt1.jpg", nil))
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("got %d, want 405", rr.Code)
	}
}

// AIOStreams validates a poster key before it will use the source, and parses
// the body as {"valid": bool}. Without this route the request fell through to
// the web app and came back as HTML, which surfaced to users as
// "Unexpected token '<' ... is not valid JSON" and made XRDB unselectable.
func TestRPDBIsValidAnswersJSON(t *testing.T) {
	h := renderingHandler(t)
	for _, tc := range []struct {
		key  string
		want bool
	}{
		{"default", true},
		{"no-such-profile-here", false},
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/"+tc.key+"/isValid", nil))

		if rr.Code != http.StatusOK {
			t.Fatalf("%s: got %d, want 200 (a non-2xx makes AIOStreams reject the key outright)", tc.key, rr.Code)
		}
		if ct := rr.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
			t.Errorf("%s: Content-Type = %q, want JSON", tc.key, ct)
		}
		var body struct {
			Valid bool `json:"valid"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
			t.Fatalf("%s: body is not JSON (%v): %s", tc.key, err, rr.Body.String())
		}
		if body.Valid != tc.want {
			t.Errorf("%s: valid = %v, want %v", tc.key, body.Valid, tc.want)
		}
	}
}
