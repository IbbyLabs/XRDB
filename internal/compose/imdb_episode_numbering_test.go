package compose

import (
	"context"
	"encoding/json"
	"image/color"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// tmdbMerged answers as TMDB does for Dandadan: one season holding every
// episode IMDb splits across two, so IMDb's season 2 is not there at all.
func tmdbMerged(t *testing.T, episodes int, asked *[]string) *httptest.Server {
	t.Helper()
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		mu.Lock()
		*asked = append(*asked, p)
		mu.Unlock()
		switch {
		case strings.Contains(p, "/find/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"tv_results": []map[string]any{{"id": 4242, "name": "A Series"}},
			})
		case strings.Contains(p, "/season/1/episode/13"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"name": "Episode Thirteen", "still_path": "/s1e13.jpg", "vote_average": 8.4, "vote_count": 120,
			})
		case strings.Contains(p, "/season/") && strings.Contains(p, "/episode/"):
			http.NotFound(w, r)
		case strings.Contains(p, "/tv/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id": 4242, "name": "A Series", "number_of_seasons": 1,
				"seasons":     []map[string]any{{"season_number": 0, "episode_count": 3}, {"season_number": 1, "episode_count": episodes}},
				"poster_path": "/series-poster.jpg",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

// imdbEpisodes stands in for the IMDb episode index: S2E1 of a 12+12 series.
type imdbEpisodes struct{ ready bool }

func (imdbEpisodes) Name() string { return "imdb_local" }
func (imdbEpisodes) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return nil, provider.ErrEpisodeNotFound
}
func (i imdbEpisodes) IMDbEpisode(series string, season, episode int) (string, int, []int, bool) {
	if !i.ready || series != "tt3603454" || season != 2 || episode != 1 {
		return "", 0, nil, false
	}
	// Dandadan as IMDb lists it: 12 + 12, and an announced third season.
	return "tt0000013", 13, []int{12, 12, 1}, true
}

func mergedPipeline(t *testing.T, tmdbEpisodes int, ready bool, asked *[]string) *Pipeline {
	t.Helper()
	srv := tmdbMerged(t, tmdbEpisodes, asked)
	tmdb := provider.NewTMDBAt("k", "", srv.URL)
	tmdb.SetHTTPClient(srv.Client())
	reg := provider.NewRegistry()
	reg.Register(tmdb)
	reg.Register(imdbEpisodes{ready: ready})
	return &Pipeline{providers: reg,
		fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{R: 10, G: 10, B: 10, A: 255})}}
}

func fetchS2E1(t *testing.T, p *Pipeline) (ratingID, url string) {
	t.Helper()
	_, _, id, _, u, err := p.fetchSourceImageAndMeta(context.Background(), Request{
		MediaType: "thumbnail", ContentType: "series",
		MediaID: "tt3603454:2:1", Config: imageconfig.Default(),
	})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	return id, u
}

// BUG-302. IMDb's S2E1 is TMDB's S1E13 when IMDb's first two seasons count TMDB's 24: the still
// is TMDB's episode 13, and the ratings are asked of the episode's own tconst.
func TestAnIMDbNumberedEpisodeIsPlacedInTheMergedSeason(t *testing.T) {
	var asked []string
	id, url := fetchS2E1(t, mergedPipeline(t, 24, true, &asked))
	if !strings.Contains(url, "s1e13") {
		t.Errorf("artwork url = %q, want TMDB's season 1 episode 13", url)
	}
	if id != "tt0000013" {
		t.Errorf("rating id = %q, want the episode's own tconst", id)
	}
}

// When the counts disagree the offset could land on another episode, so TMDB's
// still is not borrowed; the ratings still come from the episode's own tconst.
func TestMismatchedCountsKeepTheEpisodeRatingButNotTheStill(t *testing.T) {
	var asked []string
	id, url := fetchS2E1(t, mergedPipeline(t, 23, true, &asked))
	if strings.Contains(url, "s1e13") {
		t.Errorf("borrowed TMDB's episode 13 despite the counts differing: %q", url)
	}
	if strings.Contains(strings.Join(asked, " "), "/season/1/episode/13") {
		t.Errorf("asked TMDB for episode 13: %v", asked)
	}
	if id != "tt0000013" {
		t.Errorf("rating id = %q, want the episode's own tconst", id)
	}
}

// Until the index is built the episode is left unplaced, as before.
func TestAnUnbuiltIndexLeavesTheEpisodeUnplaced(t *testing.T) {
	var asked []string
	id, url := fetchS2E1(t, mergedPipeline(t, 24, false, &asked))
	if strings.Contains(url, "s1e13") || id == "tt0000013" {
		t.Errorf("placed without an index: url %q, id %q", url, id)
	}
}

func TestCoversThroughNeedsAPrefixReachingTheSeason(t *testing.T) {
	cases := []struct {
		per          []int
		season, tmdb int
		want         bool
	}{
		{[]int{12, 12, 1}, 2, 24, true},
		{[]int{12, 12}, 2, 24, true},
		{[]int{12, 12}, 1, 12, true},
		{[]int{12, 12}, 2, 12, false},
		{[]int{12, 11}, 2, 24, false},
		{[]int{12, 13}, 2, 24, false},
		{nil, 1, 0, false},
	}
	for _, c := range cases {
		if got := coversThrough(c.per, c.season, c.tmdb); got != c.want {
			t.Errorf("coversThrough(%v, %d, %d) = %v, want %v", c.per, c.season, c.tmdb, got, c.want)
		}
	}
}
