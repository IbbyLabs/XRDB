package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A bare TMDB id carries no kind. The kind store settles which record the
// number names and the artwork retry still covers a record that holds no image
// — BUG-265, where tmdb:1399 returned nothing at all while tmdb:tv:1399
// rendered.
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
	if meta.Title != "A Series" {
		t.Errorf("title = %q, want the series record", meta.Title)
	}
	if !containsPrefix(asked, "/tv/") {
		t.Errorf("endpoints asked = %v, want the series record among them", asked)
	}
}

// containsPrefix reports whether any asked path starts with prefix.
func containsPrefix(asked []string, prefix string) bool {
	for _, a := range asked {
		if strings.HasPrefix(a, prefix) {
			return true
		}
	}
	return false
}

// The control on traffic: settling a bare id's kind costs two probes the first
// time the number is seen and nothing afterwards, so a film that already worked
// still costs one call per render once the kind is known. The earlier form of
// this test demanded one call outright, which no correct answer can meet — a
// number holding a record under both kinds cannot be told apart from one that
// does not without asking the other endpoint.
func TestABareIdThatIsAFilmCostsOneCallOnceItsKindIsKnown(t *testing.T) {
	var asked []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = append(asked, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":27205,"title":"A Film","release_date":"2010-07-16","poster_path":"/f.jpg"}`))
	}))
	defer srv.Close()

	tm := &TMDB{apiKey: "k", baseURL: srv.URL, httpClient: srv.Client()}
	tm.SetKindCachePath("", nil)
	if _, err := tm.FetchArtwork(context.Background(), "poster", "tmdb:27205", ArtworkOptions{}); err != nil {
		t.Fatalf("a bare film id failed: %v", err)
	}
	firstRender := len(asked)
	asked = nil
	if _, err := tm.FetchArtwork(context.Background(), "poster", "tmdb:27205", ArtworkOptions{}); err != nil {
		t.Fatalf("a bare film id failed on the second render: %v", err)
	}
	if len(asked) != 1 || !strings.HasPrefix(asked[0], "/movie/") {
		t.Errorf("second render asked %v, want one call to the film record", asked)
	}
	if firstRender > 3 {
		t.Errorf("first render asked %d times, want the two probes and the fetch", firstRender)
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
	if !containsPrefix(asked, "/tv/") {
		t.Errorf("endpoints asked = %v, want the series record among them", asked)
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

// BUG-270. TMDB numbers /movie and /tv independently, so one number can hold a
// complete record under both. Taking the film because it answered first served
// live-action posters for a whole anime catalogue: 65942 is a series under /tv
// and an unrelated film under /movie. Popularity settles it, the same rule
// findByExternalID uses when two records claim one external id.
func TestABareIdHeldUnderBothKindsTakesTheMorePopular(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/movie/") {
			_, _ = w.Write([]byte(`{"id":65942,"title":"An Unrelated Film","poster_path":"/f.jpg","popularity":1.4}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":65942,"name":"The Series Everyone Meant","poster_path":"/s.jpg","popularity":88.2}`))
	}))
	defer srv.Close()

	tm := &TMDB{apiKey: "k", baseURL: srv.URL, httpClient: srv.Client()}
	tm.SetKindCachePath("", nil)
	meta, err := tm.FetchArtwork(context.Background(), "poster", "tmdb:65942", ArtworkOptions{})
	if err != nil {
		t.Fatalf("a bare id held under both kinds failed: %v", err)
	}
	if meta == nil || meta.Title != "The Series Everyone Meant" {
		t.Fatalf("meta = %+v, want the series, which is far the more popular record", meta)
	}
}

// The same rule the other way, so the fix is not "prefer series": a number whose
// film record is the popular one still renders the film.
func TestABareIdHeldUnderBothKindsKeepsAPopularFilm(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/movie/") {
			_, _ = w.Write([]byte(`{"id":550,"title":"The Film Everyone Meant","poster_path":"/f.jpg","popularity":97.1}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":550,"name":"An Obscure Series","poster_path":"/s.jpg","popularity":0.6}`))
	}))
	defer srv.Close()

	tm := &TMDB{apiKey: "k", baseURL: srv.URL, httpClient: srv.Client()}
	tm.SetKindCachePath("", nil)
	meta, err := tm.FetchArtwork(context.Background(), "poster", "tmdb:550", ArtworkOptions{})
	if err != nil {
		t.Fatalf("a bare id held under both kinds failed: %v", err)
	}
	if meta == nil || meta.Title != "The Film Everyone Meant" {
		t.Fatalf("meta = %+v, want the film, which is far the more popular record", meta)
	}
}
