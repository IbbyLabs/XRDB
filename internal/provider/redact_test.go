package provider

import (
	"net/url"
	"strings"
	"testing"
)

// Several of these APIs take their key as a query parameter, and net/http builds
// its errors around the request URL, so an unredacted transport error puts the
// key in the logs.
func TestRedactHTTPErrRemovesCredentials(t *testing.T) {
	cases := []struct{ name, raw, secret string }{
		{"simkl", "https://api.simkl.com/search/id?client_id=SECRETVALUE&imdb=tt1", "SECRETVALUE"},
		{"fanart", "https://webservice.fanart.tv/v3/movies/tt1?api_key=SECRETVALUE", "SECRETVALUE"},
		{"mdblist", "https://api.mdblist.com/imdb/movie/tt1?apikey=SECRETVALUE", "SECRETVALUE"},
		{"tmdb", "https://api.themoviedb.org/3/movie/1?api_key=SECRETVALUE", "SECRETVALUE"},
	}
	for _, c := range cases {
		in := &url.Error{Op: "Get", URL: c.raw, Err: errNotFound}
		got := redactHTTPErr(in).Error()
		if strings.Contains(got, c.secret) {
			t.Errorf("%s: redacted error still carries the credential: %s", c.name, got)
		}
		if !strings.Contains(got, "REDACTED") {
			t.Errorf("%s: expected a REDACTED marker, got: %s", c.name, got)
		}
	}
}

// A non-URL error carries no URL to scrub and must pass through untouched.
func TestRedactHTTPErrLeavesOtherErrorsAlone(t *testing.T) {
	if got := redactHTTPErr(errNotFound); got != errNotFound {
		t.Errorf("plain error was rewritten: %v", got)
	}
}
