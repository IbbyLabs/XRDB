package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newCinemetaTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/meta/movie/tt0468569.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"meta":{"name":"The Dark Knight","releaseInfo":"2008","imdbRating":"9.0","genres":["Action","Crime"],"poster":"https://images.metahub.space/poster/medium/tt0468569/img","background":"https://images.metahub.space/background/medium/tt0468569/img","logo":"https://images.metahub.space/logo/medium/tt0468569/img"}}`))
		case "/meta/movie/tt0903747.json":
			http.NotFound(w, r)
		case "/meta/series/tt0903747.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"meta":{"name":"Breaking Bad","releaseInfo":"2008-2013","imdbRating":"9.5","genres":["Drama"],"poster":"https://images.metahub.space/poster/medium/tt0903747/img"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
}

func TestCinemetaFetchMovie(t *testing.T) {
	srv := newCinemetaTestServer(t)
	defer srv.Close()

	c := NewCinemetaWithBaseURL(srv.URL)
	meta, err := c.Fetch(context.Background(), "poster", "tt0468569")
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if meta.Title != "The Dark Knight" {
		t.Errorf("title = %q", meta.Title)
	}
	if meta.Year != 2008 {
		t.Errorf("year = %d", meta.Year)
	}
	if len(meta.Ratings) != 1 || meta.Ratings[0].Source != "imdb" || meta.Ratings[0].Value != 9.0 {
		t.Errorf("ratings = %+v", meta.Ratings)
	}
	if meta.PosterURL != "https://images.metahub.space/poster/medium/tt0468569/img" {
		t.Errorf("poster = %q", meta.PosterURL)
	}
}

func TestCinemetaSeriesFallback(t *testing.T) {
	srv := newCinemetaTestServer(t)
	defer srv.Close()

	c := NewCinemetaWithBaseURL(srv.URL)
	meta, err := c.Fetch(context.Background(), "poster", "tt0903747")
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if meta.Title != "Breaking Bad" {
		t.Errorf("title = %q", meta.Title)
	}
}

func TestCinemetaSizeVariants(t *testing.T) {
	srv := newCinemetaTestServer(t)
	defer srv.Close()

	c := NewCinemetaWithBaseURL(srv.URL)
	meta, err := c.FetchArtwork(context.Background(), "poster", "tt0468569", ArtworkOptions{Size: "4k"})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if meta.PosterURL != "https://images.metahub.space/poster/large/tt0468569/img" {
		t.Errorf("4k poster = %q, want large variant", meta.PosterURL)
	}
}

func TestCinemetaRejectsNonIMDbID(t *testing.T) {
	c := NewCinemeta()
	if _, err := c.Fetch(context.Background(), "poster", "155"); err == nil {
		t.Error("expected error for numeric ID")
	}
}

func TestSelectImagePath(t *testing.T) {
	en, ja := "en", "ja"
	images := []tmdbImage{
		{FilePath: "/en-high.jpg", Iso639: &en, VoteAverage: 8},
		{FilePath: "/en-low.jpg", Iso639: &en, VoteAverage: 3},
		{FilePath: "/textless.jpg", Iso639: nil, VoteAverage: 5},
		{FilePath: "/ja.jpg", Iso639: &ja, VoteAverage: 6},
	}

	cases := []struct {
		name, lang, pref, want string
	}{
		{"original default", "en", "original", "/default.jpg"},
		{"textless", "en", "textless", "/textless.jpg"},
		{"clean falls back to textless", "en", "clean", "/textless.jpg"},
		{"language preference wins", "ja", "original", "/ja.jpg"},
		// alternative skips the top-ranked non-default candidate (usually a
		// near-twin of the canonical art) and returns the second.
		{"alternative differs from default", "en", "alternative", "/textless.jpg"},
		{"empty images returns default", "en", "textless", "/default.jpg"},
	}
	for _, tc := range cases {
		imgs := images
		if tc.name == "empty images returns default" {
			imgs = nil
		}
		got := selectImagePath(imgs, "/default.jpg", tc.lang, ArtworkOptions{TextPreference: tc.pref})
		if got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestSelectImagePathSkipsSVG(t *testing.T) {
	en := "en"
	// The top-voted logo is an SVG the raster pipeline can't decode; selection
	// must fall through to the best renderable (PNG) instead of picking it.
	images := []tmdbImage{
		{FilePath: "/top.svg", Iso639: &en, VoteAverage: 9},
		{FilePath: "/good.png", Iso639: &en, VoteAverage: 5},
	}
	if got := selectImagePath(images, "", "en", ArtworkOptions{}); got != "/good.png" {
		t.Errorf("expected the PNG logo, got %q", got)
	}
	if got := selectImagePath(images, "", "en", ArtworkOptions{TextPreference: "random"}); got != "/good.png" {
		t.Errorf("random must still skip SVG, got %q", got)
	}
	// Only an SVG available and no default → nothing renderable, return empty.
	if got := selectImagePath([]tmdbImage{{FilePath: "/only.svg", Iso639: &en, VoteAverage: 9}}, "", "en", ArtworkOptions{}); got != "" {
		t.Errorf("expected empty when only SVG available, got %q", got)
	}
}
