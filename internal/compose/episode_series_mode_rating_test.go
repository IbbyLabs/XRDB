package compose

import (
	"context"
	"encoding/json"
	"image/color"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// episodeArtworkMode "series" draws the series poster, and the ratings stay the
// episode's. The TMDB score arrives with the artwork, so it followed the poster
// while the sources followed the id and one row named two subjects.
func TestSeriesModeRatesTheEpisodeOnEveryBadge(t *testing.T) {
	const (
		seriesRating  = 8.6
		episodeRating = 7.5
		seriesIMDb    = "tt1710308"
		episodeIMDb   = "tt4164090"
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		switch {
		case strings.Contains(p, "/find/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"tv_episode_results": []map[string]any{
					{"show_id": 31132, "season_number": 6, "episode_number": 7},
				},
			})
		case strings.Contains(p, "/season/") && strings.Contains(p, "/episode/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"name":         "Eileen Flat Screen",
				"still_path":   "/still.jpg",
				"vote_average": episodeRating,
				"vote_count":   400,
				"external_ids": map[string]any{"imdb_id": episodeIMDb},
			})
		case strings.Contains(p, "/tv/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":           31132,
				"name":         "Regular Show",
				"poster_path":  "/poster.jpg",
				"vote_average": seriesRating,
				"vote_count":   900,
				"external_ids": map[string]any{"imdb_id": seriesIMDb},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	tmdb := provider.NewTMDBAt("k", "", srv.URL)
	tmdb.SetHTTPClient(srv.Client())
	reg := provider.NewRegistry()
	reg.Register(tmdb)

	cfg := imageconfig.Default()
	cfg.EpisodeArtworkMode = "series"
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{R: 10, G: 10, B: 10, A: 255})}}

	_, meta, ratingID, _, url, err := p.fetchSourceImageAndMeta(context.Background(), Request{
		MediaType: "poster", MediaID: episodeIMDb, Config: cfg,
	})
	if err != nil {
		t.Fatalf("series mode render failed: %v", err)
	}
	if !strings.Contains(url, "poster.jpg") {
		t.Fatalf("series mode drew %q, so this is not exercising the series branch", url)
	}
	if ratingID != episodeIMDb {
		t.Errorf("rating sources asked about %q, want the episode %q", ratingID, episodeIMDb)
	}
	var tmdbRating *provider.Rating
	for i := range meta.Ratings {
		if strings.EqualFold(meta.Ratings[i].Source, "tmdb") {
			tmdbRating = &meta.Ratings[i]
		}
	}
	if tmdbRating == nil {
		t.Fatal("no TMDB rating on the render")
	}
	if tmdbRating.Value == seriesRating {
		t.Errorf("the TMDB badge carries the series' %.1f while the sources are asked about the episode — one row, two subjects", seriesRating)
	}
	if tmdbRating.Value != episodeRating {
		t.Errorf("TMDB rating is %.1f, want the episode's %.1f", tmdbRating.Value, episodeRating)
	}
}
