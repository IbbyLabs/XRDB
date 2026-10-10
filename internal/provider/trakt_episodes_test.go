package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

const traktSeasonJSON = `[
 {"number":1,"rating":8.4,"votes":4987,"first_aired":"2008-01-21T02:00:00.000Z","ids":{"imdb":"tt0959621"}},
 {"number":2,"rating":8.1,"votes":3000,"first_aired":"2008-01-28T02:00:00.000Z","ids":{"imdb":"tt1054724"}},
 {"number":3,"rating":0,"votes":0,"first_aired":"2008-02-04T02:00:00.000Z","ids":{"imdb":""}}
]`

func traktSeasonServer(t *testing.T, calls *atomic.Int32) *Trakt {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		switch {
		case strings.HasPrefix(r.URL.Path, "/search/tmdb/1396"):
			_, _ = w.Write([]byte(`[{"show":{"ids":{"trakt":1388}}}]`))
		case r.URL.Path == "/shows/tt0903747/seasons/1", r.URL.Path == "/shows/1388/seasons/1":
			_, _ = w.Write([]byte(traktSeasonJSON))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	return &Trakt{clientID: "k", baseURL: srv.URL, httpClient: srv.Client()}
}

// A whole season of episode badges costs one request.
func TestASeasonOfEpisodesCostsOneRequest(t *testing.T) {
	var calls atomic.Int32
	tr := traktSeasonServer(t, &calls)
	var wg sync.WaitGroup
	for ep := 1; ep <= 2; ep++ {
		for range 10 {
			wg.Add(1)
			go func(ep int) {
				defer wg.Done()
				if _, err := tr.FetchEpisodeRating(context.Background(), "tt0903747", 1, ep, ""); err != nil {
					t.Errorf("episode %d: %v", ep, err)
				}
			}(ep)
		}
	}
	wg.Wait()
	if n := calls.Load(); n != 1 {
		t.Errorf("%d requests for one season, want 1", n)
	}
	m, _ := tr.FetchEpisodeRating(context.Background(), "tt0903747", 1, 2, "")
	if m.Ratings[0].Value != 8.1 || m.Ratings[0].Votes != 3000 {
		t.Errorf("episode 2 = %+v", m.Ratings[0])
	}
}

// The episode's IMDb id wins over a number that Trakt orders differently.
func TestTheEpisodeIMDbIDWinsOverItsNumber(t *testing.T) {
	var calls atomic.Int32
	tr := traktSeasonServer(t, &calls)
	m, err := tr.FetchEpisodeRating(context.Background(), "tt0903747", 1, 1, "tt1054724")
	if err != nil {
		t.Fatal(err)
	}
	if m.Ratings[0].Value != 8.1 {
		t.Errorf("matched %v, want episode tt1054724's 8.1", m.Ratings[0].Value)
	}
}

func TestATMDBSeriesResolvesOnceAndAnUnratedEpisodeIsNotFound(t *testing.T) {
	var calls atomic.Int32
	tr := traktSeasonServer(t, &calls)
	if _, err := tr.FetchEpisodeRating(context.Background(), "tmdb:1396", 1, 1, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := tr.FetchEpisodeRating(context.Background(), "tmdb:1396", 1, 3, ""); err == nil {
		t.Error("an episode with no votes answered with a rating")
	}
	if n := calls.Load(); n != 2 {
		t.Errorf("%d requests, want 2 (one search, one season)", n)
	}
}
