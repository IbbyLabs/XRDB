package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// sevenSamurai is a Japanese title whose English poster outranks its Japanese
// one, so language selection is what decides between them.
func sevenSamurai() map[string]any {
	return map[string]any{
		"title":             "Seven Samurai",
		"original_title":    "七人の侍",
		"original_language": "ja",
		"release_date":      "1954-04-26",
		"poster_path":       "/canonical.jpg",
		"images": map[string]any{
			"posters": []map[string]any{
				{"file_path": "/english.jpg", "iso_639_1": "en", "vote_average": 9.0},
				{"file_path": "/japanese.jpg", "iso_639_1": "ja", "vote_average": 5.0},
			},
		},
	}
}

// tmdbStub serves one record and records the query of every request.
func tmdbStub(t *testing.T, record map[string]any) (*TMDB, *[]url.Values) {
	t.Helper()
	var queries []url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		queries = append(queries, r.URL.Query())
		_ = json.NewEncoder(w).Encode(record)
	}))
	t.Cleanup(srv.Close)
	return &TMDB{apiKey: "test", httpClient: srv.Client(), baseURL: srv.URL}, &queries
}

// The whole point of the option: a Japanese film renders its Japanese poster
// even though the English one is rated higher.
func TestOriginalLanguageSelectsTheTitlesOwnLanguage(t *testing.T) {
	tm, _ := tmdbStub(t, sevenSamurai())

	meta, err := tm.FetchArtwork(context.Background(), "movie", "346", ArtworkOptions{Language: OriginalLanguage})
	if err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	if !strings.HasSuffix(meta.PosterURL, "/japanese.jpg") {
		t.Errorf("PosterURL = %q, want the Japanese poster", meta.PosterURL)
	}
	if meta.Language != "ja" {
		t.Errorf("Language = %q, want ja", meta.Language)
	}
}

// TMDB filters images to the languages named in the request and has no
// wildcard, so asking for a filter at all would exclude the very artwork the
// option exists to reach.
func TestOriginalLanguageAsksTMDBForEveryLanguage(t *testing.T) {
	tm, queries := tmdbStub(t, sevenSamurai())

	if _, err := tm.FetchArtwork(context.Background(), "movie", "346", ArtworkOptions{Language: OriginalLanguage}); err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	for _, q := range *queries {
		if q.Has("include_image_language") {
			t.Errorf("the request filtered images to %q", q.Get("include_image_language"))
		}
	}
}

func TestASpecificLanguageStillFiltersImages(t *testing.T) {
	tm, queries := tmdbStub(t, sevenSamurai())

	if _, err := tm.FetchArtwork(context.Background(), "movie", "346", ArtworkOptions{Language: "de"}); err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	if len(*queries) == 0 {
		t.Fatal("no request was made")
	}
	if got := (*queries)[0].Get("include_image_language"); got != "de,en,null" {
		t.Errorf("include_image_language = %q, want de,en,null", got)
	}
}

// An English-language title under the same setting is simply English; nothing
// about the option is Japanese-specific.
func TestOriginalLanguageOnAnEnglishTitle(t *testing.T) {
	tm, _ := tmdbStub(t, map[string]any{
		"title":             "The Matrix",
		"original_language": "en",
		"poster_path":       "/canonical.jpg",
		"images": map[string]any{
			"posters": []map[string]any{
				{"file_path": "/english.jpg", "iso_639_1": "en", "vote_average": 9.0},
				{"file_path": "/french.jpg", "iso_639_1": "fr", "vote_average": 9.5},
			},
		},
	})

	meta, err := tm.FetchArtwork(context.Background(), "movie", "603", ArtworkOptions{Language: OriginalLanguage})
	if err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	if meta.Language != "en" {
		t.Errorf("Language = %q, want en", meta.Language)
	}
	if strings.HasSuffix(meta.PosterURL, "/french.jpg") {
		t.Errorf("an English title took the higher-rated French poster: %q", meta.PosterURL)
	}
}

// TMDB does not always know, and a title with no original language still has to
// render something.
func TestOriginalLanguageFallsBackWhenTMDBHasNone(t *testing.T) {
	tm, _ := tmdbStub(t, map[string]any{
		"title":       "Unknown",
		"poster_path": "/canonical.jpg",
		"images":      map[string]any{"posters": []map[string]any{}},
	})

	meta, err := tm.FetchArtwork(context.Background(), "movie", "1", ArtworkOptions{Language: OriginalLanguage})
	if err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	if meta.Language != "en" {
		t.Errorf("Language = %q, want en", meta.Language)
	}
	if !strings.HasSuffix(meta.PosterURL, "/canonical.jpg") {
		t.Errorf("PosterURL = %q, want the canonical poster", meta.PosterURL)
	}
}

func TestIsOriginalLanguage(t *testing.T) {
	for _, v := range []string{"original", "Original", " ORIGINAL "} {
		if !IsOriginalLanguage(v) {
			t.Errorf("IsOriginalLanguage(%q) = false", v)
		}
	}
	for _, v := range []string{"", "en", "or"} {
		if IsOriginalLanguage(v) {
			t.Errorf("IsOriginalLanguage(%q) = true", v)
		}
	}
}

// Fanart records carry no original-language marker, so the value must not be
// read as a language code there.
func TestFanartTreatsOriginalAsNoPreference(t *testing.T) {
	f, _ := fanartStub(t, map[string]any{
		"name":    "Seven Samurai",
		"tmdb_id": "346",
		"movieposter": []map[string]string{
			{"url": "https://example.com/en.jpg", "lang": "en", "id": "1"},
		},
	})

	meta, err := f.FetchArtwork(context.Background(), "movie", "346", ArtworkOptions{Language: OriginalLanguage})
	if err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	if meta.PosterURL != "https://example.com/en.jpg" {
		t.Errorf("PosterURL = %q", meta.PosterURL)
	}
}
