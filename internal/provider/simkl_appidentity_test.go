package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// SIMKL asked for the application name, its version and a user agent on ALL
// requests. Both endpoints are captured here rather than the URL builder,
// because a test on the formatter proves the formatter.
func TestEverySIMKLRequestCarriesTheAppIdentity(t *testing.T) {
	type seen struct {
		path      string
		query     map[string]string
		userAgent string
	}
	var captured []seen

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := map[string]string{}
		for k, v := range r.URL.Query() {
			q[k] = v[0]
		}
		captured = append(captured, seen{path: r.URL.Path, query: q, userAgent: r.UserAgent()})

		if strings.HasPrefix(r.URL.Path, "/search/id") {
			_, _ = w.Write([]byte(`[{"ids":{"simkl":12345}}]`))
			return
		}
		_, _ = w.Write([]byte(`{"title":"T","year":2001,"ratings":{"simkl":{"rating":8.1,"votes":10}}}`))
	}))
	defer srv.Close()

	SetSIMKLAppVersion("3.67.0")
	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()

	if _, err := s.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Fatalf("fetch: %v", err)
	}

	// The id search and the summary call, so a change that reaches only one of
	// them fails here.
	if len(captured) < 2 {
		t.Fatalf("expected the id search and the summary call, got %d requests", len(captured))
	}
	for _, req := range captured {
		if got := req.query["app-name"]; got != simklAppName {
			t.Errorf("%s carried app-name=%q, want %q", req.path, got, simklAppName)
		}
		if got := req.query["app-version"]; got != "3.67.0" {
			t.Errorf("%s carried app-version=%q, want %q", req.path, got, "3.67.0")
		}
		if got := req.query["client_id"]; got == "" {
			t.Errorf("%s carried no client_id", req.path)
		}
		if !strings.HasPrefix(req.userAgent, "XRDB/") {
			t.Errorf("%s carried user agent %q, want one naming XRDB", req.path, req.userAgent)
		}
	}
}

// extended=full buys nothing the CDN copy does not already carry, and it makes a
// second cache key for the same content.
func TestTheSummaryCallDoesNotAskForExtended(t *testing.T) {
	var queries []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		queries = append(queries, r.URL.RawQuery)
		if strings.HasPrefix(r.URL.Path, "/search/id") {
			_, _ = w.Write([]byte(`[{"ids":{"simkl":12345}}]`))
			return
		}
		_, _ = w.Write([]byte(`{"title":"T","year":2001,"ratings":{"simkl":{"rating":8.1,"votes":10}}}`))
	}))
	defer srv.Close()

	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()

	if _, err := s.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Fatalf("fetch: %v", err)
	}
	for _, q := range queries {
		if strings.Contains(q, "extended") {
			t.Errorf("a request still asks for extended: %s", q)
		}
	}
}
