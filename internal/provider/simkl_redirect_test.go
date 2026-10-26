package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// simklRedirect answers like Simkl's /redirect: a 301 to the title's page, or to the site root.
func simklRedirect(w http.ResponseWriter, path string) {
	w.Header().Set("Location", "https://simkl.com"+path+"?client_id=cid")
	w.WriteHeader(http.StatusMovedPermanently)
}

func TestTheSimklIDIsReadFromTheRedirect(t *testing.T) {
	for _, tc := range []struct{ path, want string }{
		{"/movies/472214/inception", "472214"},
		{"/tv/17465/game-of-thrones", "17465"},
		{"/anime/40190", "40190"},
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/redirect" || r.URL.Query().Get("to") != "simkl" || r.URL.Query().Get("imdb") != "tt1375666" {
				t.Errorf("unexpected request %s", r.URL.String())
			}
			simklRedirect(w, tc.path)
		}))
		s := NewSIMKL("cid")
		s.baseURL = srv.URL
		s.httpClient = srv.Client()
		got, err := s.fetchIDByIMDB(context.Background(), "tt1375666")
		srv.Close()
		if err != nil || got != tc.want {
			t.Errorf("%s: got %q, %v; want %q", tc.path, got, err, tc.want)
		}
	}
}

// Simkl sends an id it does not know to the site root rather than a 404.
func TestAnUnknownIDIsANoMatch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		simklRedirect(w, "")
	}))
	defer srv.Close()
	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()
	if _, err := s.fetchIDByIMDB(context.Background(), "tt9999999999"); !errors.Is(err, errNotFound) {
		t.Fatalf("err = %v, want errNotFound", err)
	}
}

// Following the 301 would land on an HTML page with no id in it.
func TestTheRedirectIsNotFollowed(t *testing.T) {
	followed := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/movies/") {
			followed = true
			_, _ = w.Write([]byte("<html></html>"))
			return
		}
		w.Header().Set("Location", "/movies/472214/inception")
		w.WriteHeader(http.StatusMovedPermanently)
	}))
	defer srv.Close()
	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()
	got, err := s.fetchIDByIMDB(context.Background(), "tt1375666")
	if followed {
		t.Fatal("the redirect was followed")
	}
	if err != nil || got != "472214" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestALookupErrorIsNotANoMatch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()
	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()
	if _, err := s.fetchIDByIMDB(context.Background(), "tt1375666"); err == nil || errors.Is(err, errNotFound) {
		t.Fatalf("err = %v, want a lookup error that is not errNotFound", err)
	}
}
