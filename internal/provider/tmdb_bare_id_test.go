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

// The control: a bare id that IS a film with artwork must cost exactly one
// call, or the fix doubles the traffic on the case that already worked.
func TestABareIdThatIsAFilmCostsOneCall(t *testing.T) {
	var asked []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = append(asked, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":27205,"title":"A Film","release_date":"2010-07-16","poster_path":"/f.jpg"}`))
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

// /movie and /tv number independently, so one id can name a film with no
// artwork and a series that has some. The film record answering is not the same
// as the kind being settled.
func TestABareIdWhoseFilmRecordHasNoArtworkTriesTheSeries(t *testing.T) {
	var asked []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = append(asked, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/movie/") {
			_, _ = w.Write([]byte(`{"id":279413,"title":"A Film With No Art"}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":279413,"name":"A Series","poster_path":"/s.jpg"}`))
	}))
	defer srv.Close()

	tm := &TMDB{apiKey: "k", baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := tm.FetchArtwork(context.Background(), "poster", "tmdb:279413", ArtworkOptions{})
	if err != nil {
		t.Fatalf("a bare id with an artwork-less film record failed: %v", err)
	}
	if meta == nil || meta.PosterURL == "" {
		t.Fatal("no poster resolved, though the series record holds one")
	}
	if len(asked) != 2 || !strings.HasPrefix(asked[1], "/tv/") {
		t.Errorf("endpoints asked = %v, want the film then the series", asked)
	}
}

// When neither kind has artwork the guess stands, so an id is not reported as
// the other kind on the strength of an equally empty record.
func TestABareIdWithNoArtworkUnderEitherKindKeepsTheFilm(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/movie/") {
			_, _ = w.Write([]byte(`{"id":5,"title":"A Film With No Art"}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":5,"name":"A Series With No Art"}`))
	}))
	defer srv.Close()

	tm := &TMDB{apiKey: "k", baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := tm.FetchArtwork(context.Background(), "poster", "tmdb:5", ArtworkOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if meta == nil || meta.Title != "A Film With No Art" {
		t.Errorf("meta = %+v, want the film the guess landed on", meta)
	}
}
