package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// A signature change here used to leave the interface unsatisfied at runtime,
// silently turning the identity check off instead of failing the build.
var _ TitleIdentifier = (*TMDB)(nil)

// findStub answers /find with the given movie and tv buckets.
func findStub(t *testing.T, movie, tv []map[string]any) *TMDB {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"movie_results": movie,
			"tv_results":    tv,
		})
	}))
	t.Cleanup(srv.Close)
	return &TMDB{apiKey: "test", httpClient: srv.Client(), baseURL: srv.URL}
}

// The reported case. TMDB has tt35587659 on both a 2026 series and a 1995
// documentary; taking the movie bucket first served the documentary's artwork
// for the series.
func fiveStarWeekend() (movie, tv []map[string]any) {
	return []map[string]any{
			{"id": 275435, "title": "Apollo 13: The Untold Story", "popularity": 0.1888},
		}, []map[string]any{
			{"id": 283151, "name": "The Five Star Weekend", "popularity": 11.7903},
		}
}

func TestDuplicateIDPrefersTheRequestedContentType(t *testing.T) {
	movie, tv := fiveStarWeekend()
	tm := findStub(t, movie, tv)

	match, found, err := tm.findByExternalID(context.Background(), "tt35587659", "imdb_id", "tv")
	if err != nil || !found {
		t.Fatalf("findByExternalID: found=%v err=%v", found, err)
	}
	if match.ID != "283151" || match.ContentType != "tv" {
		t.Errorf("resolved to %s %q, want the series 283151", match.ContentType, match.ID)
	}
}

func TestDuplicateIDPrefersTheMovieWhenAskedFor(t *testing.T) {
	movie, tv := fiveStarWeekend()
	tm := findStub(t, movie, tv)

	match, found, err := tm.findByExternalID(context.Background(), "tt35587659", "imdb_id", "movie")
	if err != nil || !found {
		t.Fatalf("findByExternalID: found=%v err=%v", found, err)
	}
	if match.ID != "275435" || match.ContentType != "movie" {
		t.Errorf("resolved to %s %q, want the movie 275435", match.ContentType, match.ID)
	}
}

// A bare /poster/tt... states no content type, which is how the bug was
// reported. Popularity has to settle it, and here the series is the real title.
func TestDuplicateIDWithNoHintTakesTheMorePopularRecord(t *testing.T) {
	movie, tv := fiveStarWeekend()
	tm := findStub(t, movie, tv)

	match, found, err := tm.findByExternalID(context.Background(), "tt35587659", "imdb_id", "")
	if err != nil || !found {
		t.Fatalf("findByExternalID: found=%v err=%v", found, err)
	}
	if match.ID != "283151" {
		t.Errorf("resolved to %s %q, want the series 283151", match.ContentType, match.ID)
	}
}

// The tiebreak is popularity, not a standing preference for series.
func TestDuplicateIDWithNoHintCanStillChooseTheMovie(t *testing.T) {
	tm := findStub(t,
		[]map[string]any{{"id": 1, "title": "Real Film", "popularity": 40.0}},
		[]map[string]any{{"id": 2, "name": "Obscure Show", "popularity": 0.3}},
	)

	match, found, err := tm.findByExternalID(context.Background(), "tt1", "imdb_id", "")
	if err != nil || !found {
		t.Fatalf("findByExternalID: found=%v err=%v", found, err)
	}
	if match.ID != "1" || match.ContentType != "movie" {
		t.Errorf("resolved to %s %q, want the movie 1", match.ContentType, match.ID)
	}
}

func TestSingleBucketNeedsNoTiebreak(t *testing.T) {
	movieOnly := findStub(t, []map[string]any{{"id": 5, "title": "Only Film"}}, nil)
	match, found, err := movieOnly.findByExternalID(context.Background(), "tt5", "imdb_id", "tv")
	if err != nil || !found {
		t.Fatalf("movie-only: found=%v err=%v", found, err)
	}
	// The hint cannot invent a record that TMDB did not return.
	if match.ID != "5" || match.ContentType != "movie" {
		t.Errorf("movie-only resolved to %s %q", match.ContentType, match.ID)
	}

	tvOnly := findStub(t, nil, []map[string]any{{"id": 6, "name": "Only Show"}})
	match, found, err = tvOnly.findByExternalID(context.Background(), "tt6", "imdb_id", "movie")
	if err != nil || !found {
		t.Fatalf("tv-only: found=%v err=%v", found, err)
	}
	if match.ID != "6" || match.ContentType != "tv" {
		t.Errorf("tv-only resolved to %s %q", match.ContentType, match.ID)
	}
}

func TestNoMatchIsNotFound(t *testing.T) {
	tm := findStub(t, nil, nil)
	if _, found, err := tm.findByExternalID(context.Background(), "tt0", "imdb_id", ""); found || err != nil {
		t.Errorf("found=%v err=%v, want not found and no error", found, err)
	}
}

// FetchArtwork is where the content type actually arrives from a request, so
// the hint has to survive the trip through resolveID.
func TestFetchArtworkForASeriesResolvesTheSeriesRecord(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if len(paths) == 1 {
			movie, tv := fiveStarWeekend()
			_ = json.NewEncoder(w).Encode(map[string]any{"movie_results": movie, "tv_results": tv})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"name": "The Five Star Weekend", "poster_path": "/right.jpg"})
	}))
	defer srv.Close()
	tm := &TMDB{apiKey: "test", httpClient: srv.Client(), baseURL: srv.URL}

	meta, err := tm.FetchArtwork(context.Background(), "series", "tt35587659", ArtworkOptions{})
	if err != nil {
		t.Fatalf("FetchArtwork: %v", err)
	}
	if meta.TMDBID != "283151" {
		t.Errorf("TMDBID = %q, want 283151", meta.TMDBID)
	}
	if len(paths) < 2 || paths[1] != "/tv/283151" {
		t.Errorf("fetched %v, want the second call on /tv/283151", paths)
	}
}

func TestIdentifyIDPassesTheHintThrough(t *testing.T) {
	movie, tv := fiveStarWeekend()
	tm := findStub(t, movie, tv)

	id, contentType, err := tm.IdentifyID(context.Background(), "tt35587659", "series")
	if err != nil {
		t.Fatalf("IdentifyID: %v", err)
	}
	if id != "283151" || contentType != "series" {
		t.Errorf("IdentifyID = %q/%q, want 283151/series", id, contentType)
	}
}

func TestPreferredBucket(t *testing.T) {
	cases := map[string]string{
		"series": "tv", "tv": "tv", "show": "tv",
		"movie": "movie", "film": "movie",
		"": "", "poster": "", "backdrop": "",
	}
	for in, want := range cases {
		if got := preferredBucket(in); got != want {
			t.Errorf("preferredBucket(%q) = %q, want %q", in, got, want)
		}
	}
}
