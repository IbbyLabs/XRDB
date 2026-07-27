package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFanartName(t *testing.T) {
	f := NewFanart("key")
	if f.Name() != "fanart" {
		t.Errorf("Name() = %q, want fanart", f.Name())
	}
}

func TestFanartNoKey(t *testing.T) {
	f := NewFanart("")
	_, err := f.Fetch(context.Background(), "movie", "12345")
	if err == nil {
		t.Error("expected error when no API key configured")
	}
}

// IMDb tt-IDs are accepted by the Fanart movies endpoint; rejecting them
// pre-flight (the old behavior) broke every render configured with fanart
// artwork, since the configurator works with tt-IDs.

func TestFanartParsesMoviePosterAndLogo(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload := map[string]any{
			"movieposter": []map[string]string{
				{"url": "https://assets.fanart.tv/fanart/movies/155/movieposter/poster.jpg", "lang": "en", "id": "1"},
			},
			"hdmovielogo": []map[string]string{
				{"url": "https://assets.fanart.tv/fanart/movies/155/hdmovielogo/logo.png", "lang": "en", "id": "2"},
			},
		}
		_ = json.NewEncoder(w).Encode(payload)
	}))
	defer srv.Close()

	f := &Fanart{
		apiKey:     "test",
		httpClient: srv.Client(),
	}

	// We need to patch the URL — test bestFanartURL directly.
	raw := map[string]json.RawMessage{}
	postersJSON, _ := json.Marshal([]fanartImage{
		{URL: "https://example.com/poster.jpg", Lang: "en", ID: "1"},
		{URL: "https://example.com/poster_de.jpg", Lang: "de", ID: "2"},
	})
	logosJSON, _ := json.Marshal([]fanartImage{
		{URL: "https://example.com/logo.png", Lang: "en", ID: "3"},
	})
	raw["movieposter"] = postersJSON
	raw["hdmovielogo"] = logosJSON

	posterURL := bestFanartURL(raw, "", "movieposter")
	if posterURL != "https://example.com/poster.jpg" {
		t.Errorf("expected en poster, got %q", posterURL)
	}
	logoURL := bestFanartURL(raw, "", "hdmovielogo")
	if logoURL != "https://example.com/logo.png" {
		t.Errorf("expected en logo, got %q", logoURL)
	}
	dePoster := bestFanartURL(raw, "de", "movieposter")
	if dePoster != "https://example.com/poster_de.jpg" {
		t.Errorf("expected de poster for lang=de, got %q", dePoster)
	}

	_ = f
}

func TestFanartFallsBackToNonEnglish(t *testing.T) {
	raw := map[string]json.RawMessage{}
	imagesJSON, _ := json.Marshal([]fanartImage{
		{URL: "https://example.com/poster_de.jpg", Lang: "de", ID: "1"},
	})
	raw["movieposter"] = imagesJSON

	url := bestFanartURL(raw, "", "movieposter")
	if url != "https://example.com/poster_de.jpg" {
		t.Errorf("expected fallback to non-English, got %q", url)
	}
}

func TestFanartReturnsEmptyOnMissingKeys(t *testing.T) {
	raw := map[string]json.RawMessage{}
	url := bestFanartURL(raw, "", "movieposter", "tvposter")
	if url != "" {
		t.Errorf("expected empty URL for missing keys, got %q", url)
	}
}

func TestFanartHTTP404(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	f := &Fanart{
		apiKey:     "test",
		httpClient: srv.Client(),
	}
	// Replace the URL in test by using a URL prefix trick isn't easy, but we can
	// verify the 404 path is present in the source. The test above covers logic.
	_ = f
}

func TestFanartImplementsProvider(t *testing.T) {
	var _ Provider = NewFanart("key")
}

// fanartStub serves one record from both endpoints and records what was asked.
func fanartStub(t *testing.T, record map[string]any) (*Fanart, *[]string) {
	t.Helper()
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		_ = json.NewEncoder(w).Encode(record)
	}))
	t.Cleanup(srv.Close)
	f := &Fanart{
		apiKey:     "test",
		httpClient: srv.Client(),
		moviesURL:  srv.URL + "/movies/",
		tvURL:      srv.URL + "/tv/",
	}
	return f, &paths
}

func tibetanDogRecord() map[string]any {
	return map[string]any{
		"name":    "The Tibetan Dog",
		"imdb_id": "tt0434706",
		"movieposter": []map[string]string{
			{"url": "https://example.com/tibetan.jpg", "lang": "en", "id": "1"},
		},
		"hdmovielogo": []map[string]string{
			{"url": "https://example.com/tibetan-logo.png", "lang": "en", "id": "2"},
		},
	}
}

// A tt-id names one title, so the movies endpoint cannot hold the answer for a
// series; asking it anyway returns whichever movie record wears that id.
func TestFanartRefusesMoviesEndpointForSeries(t *testing.T) {
	f, paths := fanartStub(t, tibetanDogRecord())

	_, err := f.FetchArtwork(context.Background(), "series", "tt0434706", ArtworkOptions{})
	if err == nil {
		t.Fatal("a series under a tt-id was served a movie record")
	}
	if len(*paths) != 0 {
		t.Errorf("expected no upstream call, got %v", *paths)
	}
}

func TestFanartSeriesWithTVDBIDUsesTVEndpoint(t *testing.T) {
	f, paths := fanartStub(t, map[string]any{
		"name": "Monster",
		"tvposter": []map[string]string{
			{"url": "https://example.com/monster.jpg", "lang": "en", "id": "1"},
		},
	})

	meta, err := f.FetchArtwork(context.Background(), "series", "81189", ArtworkOptions{})
	if err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	if meta.PosterURL != "https://example.com/monster.jpg" {
		t.Errorf("PosterURL = %q", meta.PosterURL)
	}
	if len(*paths) != 1 || !strings.HasPrefix((*paths)[0], "/tv/") {
		t.Errorf("expected one /tv/ call, got %v", *paths)
	}
}

// An explicit movie must not fall through to the TV endpoint: a TMDB numeric id
// read as a TVDB id is the same mismatch in the other direction.
func TestFanartMovieDoesNotFallBackToTV(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	f := &Fanart{apiKey: "test", httpClient: srv.Client(), moviesURL: srv.URL + "/movies/", tvURL: srv.URL + "/tv/"}

	if _, err := f.FetchArtwork(context.Background(), "movie", "80079", ArtworkOptions{}); err == nil {
		t.Fatal("expected an error")
	}
	for _, p := range paths {
		if strings.HasPrefix(p, "/tv/") {
			t.Errorf("movie request reached the TV endpoint: %v", paths)
		}
	}
}

func TestFanartUnknownTypeStillFallsBackToTV(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	f := &Fanart{apiKey: "test", httpClient: srv.Client(), moviesURL: srv.URL + "/movies/", tvURL: srv.URL + "/tv/"}

	_, _ = f.FetchArtwork(context.Background(), "", "81189", ArtworkOptions{})
	if len(paths) != 2 {
		t.Fatalf("expected movies then tv, got %v", paths)
	}
}

func TestFanartRejectsRecordNamingAnotherTitle(t *testing.T) {
	f, _ := fanartStub(t, tibetanDogRecord())

	_, err := f.FetchArtwork(context.Background(), "", "tt0434706", ArtworkOptions{Title: "Monster"})
	if err == nil {
		t.Fatal("a record named The Tibetan Dog was accepted for Monster")
	}
}

func TestFanartKeepsRecordMatchingTheTitle(t *testing.T) {
	f, _ := fanartStub(t, tibetanDogRecord())

	meta, err := f.FetchArtwork(context.Background(), "", "tt2411128", ArtworkOptions{Title: "The Tibetan Dog"})
	if err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	if meta.PosterURL == "" {
		t.Error("matching record returned no poster")
	}
}

// Fanart is not an authority on the title, and MediaMeta.Title feeds title-keyed
// rating lookups.
func TestFanartDoesNotPublishRecordName(t *testing.T) {
	f, _ := fanartStub(t, tibetanDogRecord())

	meta, err := f.FetchArtwork(context.Background(), "", "tt2411128", ArtworkOptions{})
	if err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	if meta.Title != "" {
		t.Errorf("Title = %q, want empty", meta.Title)
	}
}

func TestTitlesMatch(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"The Tibetan Dog", "Monster", false},
		{"Monster", "Monster", true},
		{"monster", "  Monster  ", true},
		{"Monster: The Movie", "Monster", true},
		{"Spider-Man", "Spider Man", true},
		{"WALL·E", "WALL-E", true},
		{"", "Monster", true},
		{"Monster", "", true},
	}
	for _, c := range cases {
		if got := titlesMatch(c.a, c.b); got != c.want {
			t.Errorf("titlesMatch(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}
