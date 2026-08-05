package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Resolving an IMDb id to a SIMKL id is one of the two requests every rating
// fetch costs, and the answer never changes.
func TestTheIMDbLookupHappensOnce(t *testing.T) {
	lookups := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/search/id") {
			lookups++
			_, _ = w.Write([]byte(`[{"ids":{"simkl":12345}}]`))
			return
		}
		_, _ = w.Write([]byte(`{"title":"T","year":2001,"ratings":{"simkl":{"rating":8.1,"votes":10}}}`))
	}))
	defer srv.Close()

	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()

	for i := 0; i < 4; i++ {
		if _, err := s.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
			t.Fatalf("fetch %d: %v", i, err)
		}
	}
	if lookups != 1 {
		t.Errorf("the id lookup ran %d times; it should be resolved once", lookups)
	}
}

// Two titles are two mappings.
func TestEachTitleGetsItsOwnLookup(t *testing.T) {
	lookups := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/search/id") {
			lookups++
			_, _ = w.Write([]byte(`[{"ids":{"simkl":12345}}]`))
			return
		}
		_, _ = w.Write([]byte(`{"title":"T","year":2001,"ratings":{"simkl":{"rating":8.1,"votes":10}}}`))
	}))
	defer srv.Close()

	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()

	_, _ = s.Fetch(context.Background(), "movie", "tt0111161")
	_, _ = s.Fetch(context.Background(), "movie", "tt0068646")
	if lookups != 2 {
		t.Errorf("lookups = %d, want one per title", lookups)
	}
}

// A failed lookup must not be remembered as an answer.
func TestAFailedLookupIsNotRemembered(t *testing.T) {
	lookups := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		lookups++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()

	_, _ = s.Fetch(context.Background(), "movie", "tt0111161")
	_, _ = s.Fetch(context.Background(), "movie", "tt0111161")
	if lookups != 2 {
		t.Errorf("a failing lookup was remembered: lookups = %d, want 2", lookups)
	}
}

// A source that is down and a title the source does not carry are different
// answers. Caching the first would hide a title for the term of the miss over
// what may be a moment's outage.
func TestAnOutageIsNotMistakenForANoMatch(t *testing.T) {
	lookups := 0
	failing := true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/search/id") {
			_, _ = w.Write([]byte(`{"title":"T","year":2001,"ratings":{"simkl":{"rating":8.1,"votes":10}}}`))
			return
		}
		lookups++
		if failing {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(`[{"ids":{"simkl":12345}}]`))
	}))
	defer srv.Close()

	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()

	if _, err := s.Fetch(context.Background(), "movie", "tt0111161"); err == nil {
		t.Fatal("a failing lookup returned no error")
	}
	failing = false
	if _, err := s.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Fatalf("the title was not resolved once the source recovered: %v", err)
	}
	if lookups != 2 {
		t.Errorf("the recovered title was searched %d times, want 2", lookups)
	}
}
