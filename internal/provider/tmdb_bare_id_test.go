package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A bare TMDB id carries no kind, so it is guessed as a film. That is right for
// films and 404s for every series — BUG-265, where tmdb:1399 returned nothing at
// all while tmdb:tv:1399 rendered.
func TestABareIdThatIsASeriesFallsBackToTheOtherKind(t *testing.T) {
	var asked []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = append(asked, r.URL.Path)
		if strings.HasPrefix(r.URL.Path, "/movie/") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":1399,"name":"A Series","first_air_date":"2011-04-17"}`))
	}))
	defer srv.Close()

	tm := &TMDB{apiKey: "k", baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := tm.FetchArtwork(context.Background(), "poster", "tmdb:1399", ArtworkOptions{})
	if err != nil {
		t.Fatalf("a bare series id still failed: %v", err)
	}
	if meta == nil {
		t.Fatal("no metadata returned")
	}
	if len(asked) != 2 || !strings.HasPrefix(asked[0], "/movie/") || !strings.HasPrefix(asked[1], "/tv/") {
		t.Errorf("endpoints asked = %v, want the film guess then the series retry", asked)
	}
}

// The control: a bare id that IS a film must cost exactly one call, or the fix
// doubles the traffic on the case that already worked.
func TestABareIdThatIsAFilmCostsOneCall(t *testing.T) {
	var asked []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = append(asked, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":27205,"title":"A Film","release_date":"2010-07-16"}`))
	}))
	defer srv.Close()

	tm := &TMDB{apiKey: "k", baseURL: srv.URL, httpClient: srv.Client()}
	if _, err := tm.FetchArtwork(context.Background(), "poster", "tmdb:27205", ArtworkOptions{}); err != nil {
		t.Fatalf("a bare film id failed: %v", err)
	}
	if len(asked) != 1 {
		t.Errorf("endpoints asked = %v, want one call and no retry", asked)
	}
}

// An id given its kind explicitly is not a guess, so a genuine miss must stay a
// miss rather than being retried as the other kind.
func TestAnExplicitKindIsNotRetried(t *testing.T) {
	var asked []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = append(asked, r.URL.Path)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	tm := &TMDB{apiKey: "k", baseURL: srv.URL, httpClient: srv.Client()}
	if _, err := tm.FetchArtwork(context.Background(), "series", "tmdb:tv:99999", ArtworkOptions{}); err == nil {
		t.Fatal("an explicit series id that TMDB does not have returned no error")
	}
	if len(asked) != 1 {
		t.Errorf("endpoints asked = %v, want one call — an explicit kind is not a guess", asked)
	}
}
