package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFilmwebName(t *testing.T) {
	if NewFilmweb().Name() != "filmweb" {
		t.Error("expected name filmweb")
	}
}

func TestFilmwebImplementsInterfaces(t *testing.T) {
	var _ Provider = NewFilmweb()
	var _ TitleRatingProvider = NewFilmweb()
	var _ RatingSourcer = NewFilmweb()
}

func TestParseFilmwebRatingAcrossPageShapes(t *testing.T) {
	// The score sits in an inline script on some layouts and in markup on
	// others, so each shape the site serves has to be recognised.
	cases := []struct {
		name string
		page string
		want float64
	}{
		{"inline film data", `window.IRI.setSource('filmDataRating', { rate: 8.1, count: 900000 });`, 8.1},
		{"inline film rating", `window.IRI.setSource('filmRating', { rate: "7,4", count: 10 });`, 7.4},
		{"inline quoted key", `window.IRI.setSource('filmDataRating', {"rate":"7,4","count":10});`, 7.4},
		{"microdata", `<span itemprop="ratingValue">6,9</span>`, 6.9},
		{"rate value class", `<span class="filmRating__rateValue">5.5</span>`, 5.5},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := parseFilmwebRating(c.page)
			if !ok || got != c.want {
				t.Errorf("parseFilmwebRating = %v, %v; want %v, true", got, ok, c.want)
			}
		})
	}
}

func TestParseFilmwebRatingRejectsOutOfRange(t *testing.T) {
	if _, ok := parseFilmwebRating(`<span itemprop="ratingValue">88</span>`); ok {
		t.Error("expected a score above 10 to be rejected")
	}
	if _, ok := parseFilmwebRating(`<p>no score anywhere</p>`); ok {
		t.Error("expected no score to be reported")
	}
}

func TestBestFilmwebCandidatePrefersPolishTitle(t *testing.T) {
	// Both hits are the same film; the Polish index entry is the one whose page
	// reliably carries a score.
	body := `{"searchHits":[
		{"id":193378,"type":"film","matchedTitle":"The Dark Knight","matchedLang":"en"},
		{"id":193378,"type":"film","matchedTitle":"The Dark Knight","matchedLang":"pl"}
	]}`
	got, ok := bestFilmwebCandidate(body, "film", foldAll([]string{"The Dark Knight"}))
	if !ok || got.lang != "pl" {
		t.Errorf("candidate = %+v (ok=%v), want the pl entry", got, ok)
	}
}

func TestBestFilmwebCandidateSkipsWrongType(t *testing.T) {
	body := `{"searchHits":[{"id":1,"type":"serial","matchedTitle":"Fargo","matchedLang":"en"}]}`
	if _, ok := bestFilmwebCandidate(body, "film", foldAll([]string{"Fargo"})); ok {
		t.Error("a series hit should not answer a film lookup")
	}
}

func TestFilmwebFetchByTitle(t *testing.T) {
	var pagePath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/live/search" {
			_, _ = w.Write([]byte(`{"searchHits":[{"id":193378,"type":"film",` +
				`"matchedTitle":"Mroczny Rycerz","matchedLang":"pl"}]}`))
			return
		}
		pagePath = r.URL.Path
		_, _ = w.Write([]byte(`window.IRI.setSource('filmDataRating', { rate: 8.1 });`))
	}))
	defer srv.Close()

	f := NewFilmweb()
	f.baseURL = srv.URL
	meta, err := f.FetchByTitle(context.Background(), "movie", "The Dark Knight", "Mroczny Rycerz", 2008)
	if err != nil {
		t.Fatalf("FetchByTitle: %v", err)
	}
	if len(meta.Ratings) != 1 || meta.Ratings[0].Source != "filmweb" || meta.Ratings[0].Value != 8.1 {
		t.Fatalf("ratings = %+v, want one filmweb 8.1", meta.Ratings)
	}
	// The page address is built from the id and the release year; getting
	// either wrong lands on a different title or a 404.
	if !strings.Contains(pagePath, "2008") || !strings.Contains(pagePath, "193378") {
		t.Errorf("page path = %q, want the year and id in it", pagePath)
	}
}

func TestFilmwebNeedsAReleaseYear(t *testing.T) {
	// Without a year there is no page address to build, so it should give up
	// before making a request rather than fetching a wrong page.
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		_, _ = w.Write([]byte(`{"searchHits":[]}`))
	}))
	defer srv.Close()

	f := NewFilmweb()
	f.baseURL = srv.URL
	if _, err := f.FetchByTitle(context.Background(), "movie", "The Dark Knight", "", 0); err == nil {
		t.Error("expected an error without a release year")
	}
	if called {
		t.Error("expected no request without a release year")
	}
}

func TestFilmwebFetchByIDIsRefused(t *testing.T) {
	if _, err := NewFilmweb().Fetch(context.Background(), "movie", "tt0468569"); err == nil {
		t.Error("expected Fetch by id to be refused")
	}
}
