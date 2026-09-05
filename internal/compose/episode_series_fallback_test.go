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

// tmdbOneSeason answers as TMDB does for a series it files under a single
// season: the asked-for season has no episode still, season 1 does, and the
// series record says how many seasons there are.
func tmdbOneSeason(t *testing.T, seasons int, asked *[]string) *httptest.Server {
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
		case strings.Contains(p, "/season/1/episode/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"name": "The Only Season", "still_path": "/the-right-still.jpg",
			})
		case strings.Contains(p, "/season/") && strings.Contains(p, "/episode/"):
			// Any other season: TMDB answers 404 for a season it does not have,
			// which is what a catalogue id in the season slot asks for. An
			// earlier version of this stub answered 200 with an empty still,
			// a shape TMDB never sends, and the feature passed its test while
			// doing nothing in production.
			http.NotFound(w, r)
		case strings.Contains(p, "/tv/"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id": 4242, "name": "A Series",
				"number_of_seasons": seasons,
				"poster_path":       "/series-poster.jpg",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func oneSeasonPipeline(t *testing.T, srv *httptest.Server) *Pipeline {
	t.Helper()
	tmdb := provider.NewTMDBAt("k", "", srv.URL)
	tmdb.SetHTTPClient(srv.Client())
	reg := provider.NewRegistry()
	reg.Register(tmdb)
	return &Pipeline{providers: reg,
		fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{R: 10, G: 10, B: 10, A: 255})}}
}

// BUG-286 case 1. Callers outside XRDB put a catalogue id where the season
// belongs, and for most of the anime dataset nothing maps it back, so no
// conversion is possible. A series TMDB files under one season has only one
// place the episode can be, whatever the number said.
func TestAnUnplaceableSeasonFallsBackToTheOnlySeason(t *testing.T) {
	var asked []string
	p := oneSeasonPipeline(t, tmdbOneSeason(t, 1, &asked))

	_, _, _, _, url, err := p.fetchSourceImageAndMeta(context.Background(), Request{
		MediaType: "thumbnail", ContentType: "series",
		MediaID: "tt3603454:50551:1", Config: imageconfig.Default(),
	})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if !strings.Contains(url, "the-right-still") {
		t.Errorf("artwork url = %q, want the season 1 still", url)
	}
	if !strings.Contains(strings.Join(asked, " "), "/season/1/episode/1") {
		t.Errorf("season 1 was never asked for: %v", asked)
	}
}

// The control. Same request against a series with two seasons: the count is
// consulted and the retry refused, so the number is what decides rather than the
// retry firing whenever a still is missing.
func TestAMultiSeasonSeriesDoesNotFallBackToSeasonOne(t *testing.T) {
	var asked []string
	p := oneSeasonPipeline(t, tmdbOneSeason(t, 2, &asked))

	_, _, _, _, url, err := p.fetchSourceImageAndMeta(context.Background(), Request{
		MediaType: "thumbnail", ContentType: "series",
		MediaID: "tt3603454:50551:1", Config: imageconfig.Default(),
	})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if strings.Contains(url, "the-right-still") {
		t.Errorf("placed an episode in season 1 of a two-season series: %q", url)
	}
	if strings.Contains(strings.Join(asked, " "), "/season/1/episode/1") {
		t.Errorf("season 1 was asked for despite the series having two: %v", asked)
	}
}

// An episode already asking for season 1 must not spend a request asking how
// many seasons there are, since the retry could only repeat what just failed.
func TestSeasonOneDoesNotAskForTheCount(t *testing.T) {
	var asked []string
	p := oneSeasonPipeline(t, tmdbOneSeason(t, 1, &asked))

	if _, _, _, _, _, err := p.fetchSourceImageAndMeta(context.Background(), Request{
		MediaType: "thumbnail", ContentType: "series",
		MediaID: "tt3603454:1:9", Config: imageconfig.Default(),
	}); err != nil {
		t.Fatalf("fetch: %v", err)
	}
	for _, path := range asked {
		if strings.HasSuffix(path, "/tv/4242") {
			t.Errorf("asked for the season count on a season 1 request: %v", asked)
			break
		}
	}
}

// TMDB numbers a special as season 0, so a special with no still must not be
// answered with season 1's artwork. That would be a wrong image rather than a
// missing one, which is the failure this whole area is about.
func TestASpecialIsNotAnsweredWithSeasonOne(t *testing.T) {
	var asked []string
	p := oneSeasonPipeline(t, tmdbOneSeason(t, 1, &asked))

	_, _, _, _, url, err := p.fetchSourceImageAndMeta(context.Background(), Request{
		MediaType: "thumbnail", ContentType: "series",
		MediaID: "tt3603454:0:3", Config: imageconfig.Default(),
	})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if strings.Contains(url, "the-right-still") {
		t.Errorf("a special was given season 1's still: %q", url)
	}
	if strings.Contains(strings.Join(asked, " "), "/season/1/episode/") {
		t.Errorf("season 1 was fetched for a special: %v", asked)
	}
}

// A TMDB failure is not an absence. During an outage every episode request
// fails, and retrying each one would spend further requests on the source that
// is already failing.
func TestATMDBFailureDoesNotSpendMoreRequests(t *testing.T) {
	var mu sync.Mutex
	var asked []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		asked = append(asked, r.URL.Path)
		mu.Unlock()
		if strings.Contains(r.URL.Path, "/find/") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"tv_results": []map[string]any{{"id": 4242, "name": "A Series"}},
			})
			return
		}
		// Everything else is the outage.
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	p := oneSeasonPipeline(t, srv)

	_, _, _, _, _, err := p.fetchSourceImageAndMeta(context.Background(), Request{
		MediaType: "thumbnail", ContentType: "series",
		MediaID: "tt3603454:50551:1", Config: imageconfig.Default(),
	})
	// A failure here is fine either way: what is under test is what was asked
	// for, not what came back.
	_ = err
	// The series-artwork fallback legitimately asks for /tv/4242, and the season
	// count would use the same path, so the count is what separates them: one
	// visit is the fallback, two means the retry also asked.
	visits := 0
	for _, path := range asked {
		if strings.HasSuffix(path, "/tv/4242") {
			visits++
		}
		if strings.Contains(path, "/season/1/episode/") {
			t.Errorf("retried season 1 while TMDB was failing: %v", asked)
		}
	}
	if visits > 1 {
		t.Errorf("asked for the series %d times while TMDB was failing, want 1: %v", visits, asked)
	}
}

// A 404 while resolving the series is not the episode saying it is not there.
// Acting on it would send a season-count request about a series TMDB has never
// heard of, to learn nothing.
func TestAnUnknownSeriesIsNotAnEpisodeAbsence(t *testing.T) {
	var mu sync.Mutex
	var asked []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		asked = append(asked, r.URL.Path)
		mu.Unlock()
		// TMDB knows nothing about this id, at any endpoint.
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	p := oneSeasonPipeline(t, srv)

	_, _, _, _, _, err := p.fetchSourceImageAndMeta(context.Background(), Request{
		MediaType: "thumbnail", ContentType: "series",
		MediaID: "tt3603454:50551:1", Config: imageconfig.Default(),
	})
	_ = err
	for _, path := range asked {
		if strings.Contains(path, "/season/1/episode/") {
			t.Errorf("retried season 1 for a series TMDB does not have: %v", asked)
			break
		}
	}
}
