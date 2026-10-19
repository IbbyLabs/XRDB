package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
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
		{2, 74, 2, 136},  // its last
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
