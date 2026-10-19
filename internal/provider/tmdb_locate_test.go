package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// seasonStub serves /tv/<id>/season/<n> with the episode numbers given for n.
func seasonStub(t *testing.T, seasons map[int][2]int) *TMDB {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		i := strings.LastIndex(r.URL.Path, "/season/")
		n, err := strconv.Atoi(r.URL.Path[i+len("/season/"):])
		span, ok := seasons[n]
		if i < 0 || err != nil || !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		type ep struct {
			EpisodeNumber int `json:"episode_number"`
		}
		var out struct {
			Episodes []ep `json:"episodes"`
		}
		for e := span[0]; e <= span[1]; e++ {
			out.Episodes = append(out.Episodes, ep{e})
		}
		_ = json.NewEncoder(w).Encode(out)
	}))
	t.Cleanup(srv.Close)
	tm := NewTMDB("key", "")
	tm.httpClient = srv.Client()
	tm.baseURL = srv.URL
	return tm
}

// BUG-299. TMDB numbers Hunter x Hunter (2011) on across seasons: 1-62, 63-136
// and 137-148.
func TestLocateEpisodeOnContinuousNumbering(t *testing.T) {
	tm := seasonStub(t, map[int][2]int{1: {1, 62}, 2: {63, 136}, 3: {137, 148}})
	cases := []struct{ season, episode, wantS, wantE int }{
		{2, 1, 2, 63},    // a season's first episode
		{2, 12, 2, 74},   // its twelfth
		{1, 63, 2, 63},   // a number past season 1's end
		{1, 140, 3, 140}, // two seasons on
	}
	for _, tc := range cases {
		s, e, ok := tm.LocateEpisode(context.Background(), "46298", tc.season, tc.episode)
		if !ok || s != tc.wantS || e != tc.wantE {
			t.Errorf("LocateEpisode(%d, %d) = %d, %d, %v; want %d, %d", tc.season, tc.episode, s, e, ok, tc.wantS, tc.wantE)
		}
	}
}

func TestLocateEpisodeLeavesOrdinaryNumberingAlone(t *testing.T) {
	tm := seasonStub(t, map[int][2]int{1: {1, 10}, 2: {1, 10}})
	for _, tc := range [][2]int{{1, 11}, {2, 11}, {3, 1}, {1, 200}} {
		if s, e, ok := tm.LocateEpisode(context.Background(), "1", tc[0], tc[1]); ok {
			t.Errorf("LocateEpisode(%d, %d) placed it at %d, %d on a show numbered from 1 each season", tc[0], tc[1], s, e)
		}
	}
}

// An episode TMDB files under its own number, missing only a still, is left
// alone: 2:63 of a continuously numbered show is TMDB 2x63, not its 63rd.
func TestLocateEpisodeLeavesAFiledNumberAlone(t *testing.T) {
	tm := seasonStub(t, map[int][2]int{1: {1, 62}, 2: {63, 136}})
	if s, e, ok := tm.LocateEpisode(context.Background(), "46298", 2, 63); ok {
		t.Errorf("2:63 was moved to %d:%d", s, e)
	}
}

// A season read once is reused, so a popular unaired episode does not cost a
// TMDB call per render.
func TestSeasonEpisodeNumbersAreCached(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(`{"episodes":[{"episode_number":1},{"episode_number":2}]}`))
	}))
	t.Cleanup(srv.Close)
	tm := NewTMDB("key", "")
	tm.httpClient = srv.Client()
	tm.baseURL = srv.URL
	for i := 0; i < 3; i++ {
		tm.LocateEpisode(context.Background(), "1", 1, 2)
	}
	if calls != 1 {
		t.Errorf("TMDB was asked %d times, want 1", calls)
	}
}

func TestSeasonNumbersSweepDropsExpiredEntries(t *testing.T) {
	tm := NewTMDB("key", "")
	now := time.Now()
	stale := now.Add(-seasonNumbersTTL - time.Minute)
	tm.seasonNumbers.Store("1/1", &cachedSeasonNumbers{at: stale})
	tm.seasonNumbers.Store("1/2", &cachedSeasonNumbers{at: now})

	tm.sweepSeasonNumbers(now)
	if _, ok := tm.seasonNumbers.Load("1/1"); ok {
		t.Error("an expired entry survived the sweep")
	}
	if _, ok := tm.seasonNumbers.Load("1/2"); !ok {
		t.Error("a fresh entry was swept")
	}

	tm.seasonNumbers.Store("1/3", &cachedSeasonNumbers{at: stale})
	tm.sweepSeasonNumbers(now.Add(time.Minute))
	if _, ok := tm.seasonNumbers.Load("1/3"); !ok {
		t.Error("a second sweep ran within the interval")
	}
	tm.sweepSeasonNumbers(now.Add(seasonNumbersTTL))
	if _, ok := tm.seasonNumbers.Load("1/3"); ok {
		t.Error("no sweep ran once the interval had passed")
	}
}

func TestSeasonEpisodeNumbersSweepsOnStore(t *testing.T) {
	tm := seasonStub(t, map[int][2]int{1: {1, 2}})
	tm.seasonNumbers.Store("old/1", &cachedSeasonNumbers{at: time.Now().Add(-seasonNumbersTTL - time.Minute)})
	tm.seasonEpisodeNumbers(context.Background(), "1", 1)
	if _, ok := tm.seasonNumbers.Load("old/1"); ok {
		t.Error("storing a season did not sweep an expired entry")
	}
}

func TestSeasonNumbersConcurrentLookupsAndSweeps(t *testing.T) {
	tm := seasonStub(t, map[int][2]int{1: {1, 2}, 2: {3, 4}})
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				tm.seasonEpisodeNumbers(context.Background(), strconv.Itoa(j%5), 1+j%2)
				tm.sweepSeasonNumbers(time.Now().Add(time.Duration(i*j) * time.Hour))
			}
		}(i)
	}
	wg.Wait()
}
