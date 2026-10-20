package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// An id carrying path or query characters stays one escaped path segment.
func TestFetchByTMDBIDEscapesTheID(t *testing.T) {
	var gotPath, gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotQuery = r.URL.EscapedPath(), r.URL.RawQuery
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)
	tm := NewTMDB("key", "")
	tm.httpClient = srv.Client()
	tm.baseURL = srv.URL

	_, _ = tm.fetchByTMDBID(context.Background(), "movie", "1/../search/multi?query=x", ArtworkOptions{})
	if gotPath != "/movie/1%2F..%2Fsearch%2Fmulti%3Fquery=x" {
		t.Errorf("TMDB saw path %q", gotPath)
	}
	if strings.Contains(gotQuery, "query=") {
		t.Errorf("TMDB saw query %q, want only XRDB's own parameters", gotQuery)
	}
}
