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

// tmdbNoStill answers as TMDB does for a series whose episode stills nobody has
// filled in: the series is there with a poster, the episode is there without a
// still.
func tmdbNoStill(t *testing.T, asked *[]string) *httptest.Server {
	t.Helper()
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		mu.Lock()
		*asked = append(*asked, p)
		mu.Unlock()
		switch {
		case strings.Contains(p, "/find/"):
			// TMDB resolves an external id it knows and nothing else. A colon
			// form carrying a season and episode is not an id it holds, which
			// is the whole reason the tail has to come off first.
			switch {
			case strings.HasSuffix(p, "/find/tt3603454"):
				_ = json.NewEncoder(w).Encode(map[string]any{
					"tv_results": []map[string]any{{"id": 4242, "name": "A Series"}},
				})
			case strings.HasSuffix(p, "/find/tt9999001"):
				// An episode addressed by its own tconst. TMDB answers with the
				// show id as a bare number, which is what identifyEpisode hands on.
				_ = json.NewEncoder(w).Encode(map[string]any{
					"tv_episode_results": []map[string]any{
						{"show_id": 4242, "season_number": 2, "episode_number": 1},
					},
				})
			default:
				_ = json.NewEncoder(w).Encode(map[string]any{"tv_results": []any{}})
			}
		case strings.Contains(p, "/season/") && strings.Contains(p, "/episode/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"name":       "An Episode",
				"still_path": "",
			})
		case strings.Contains(p, "/tv/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id": 4242, "name": "A Series",
				"poster_path":   "/series-poster.jpg",
				"backdrop_path": "/series-backdrop.jpg",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

// An episode TMDB has no still for falls back to the series artwork, and did
// not when the id was written in tt form. The season and episode were left on
// the id, so the fallback asked title-keyed sources for "tt…:2:1", which none
// of them holds, and the render ended as a placeholder while the series image
// sat there servable.
//
// The tmdb-form id is the control: it took the fallback before this change and
// still does, so a failure on the tt row alone is the tail not being stripped
// rather than the fallback being broken.
func TestAnEpisodeWithNoStillFallsBackToTheSeriesArtwork(t *testing.T) {
	var asked []string
	srv := tmdbNoStill(t, &asked)

	for _, tc := range []struct{ name, mediaID, contentType string }{
		{"tt form", "tt3603454:2:1", "series"},
		{"tmdb form, the control", "tmdb:4242:2:1", "series"},
		// identifyEpisode's path: no season or episode on the id, and the series
		// it hands back is a bare number with no scheme. The unset content type
		// is the case that decides whether a scheme-less id is safe, because
		// nothing else says the number names a series rather than a film.
		{"bare episode tconst", "tt9999001", "series"},
		{"bare episode tconst, no content type", "tt9999001", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tmdb := provider.NewTMDBAt("k", "", srv.URL)
			tmdb.SetHTTPClient(srv.Client())
			reg := provider.NewRegistry()
			reg.Register(tmdb)

			cfg := imageconfig.Default()
			p := &Pipeline{providers: reg,
				fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{R: 10, G: 10, B: 10, A: 255})}}

			_, _, _, _, url, err := p.fetchSourceImageAndMeta(context.Background(), Request{
				MediaType: "poster", ContentType: tc.contentType, MediaID: tc.mediaID, Config: cfg,
			})
			if err != nil {
				t.Fatalf("fetch: %v", err)
			}
			if url == "" {
				t.Fatal("no artwork was found, so the render is a placeholder while the series image is servable")
			}
			if !strings.Contains(url, "series-poster") {
				t.Errorf("artwork url = %q, want the series poster", url)
			}
			// A scheme-less series id could be read as a film. Asserting the
			// series endpoint was asked and the film one was not is what makes
			// the passing url evidence rather than a coincidence.
			var sawTV, sawMovie bool
			for _, path := range asked {
				sawTV = sawTV || strings.Contains(path, "/tv/4242")
				sawMovie = sawMovie || strings.Contains(path, "/movie/4242")
			}
			if !sawTV {
				t.Errorf("the series endpoint was never asked; paths were %v", asked)
			}
			if sawMovie {
				t.Errorf("the film endpoint was asked for a series id; paths were %v", asked)
			}
		})
	}
}
