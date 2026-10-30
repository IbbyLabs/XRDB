package provider

import (
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const episodeRows = "tconst\tparentTconst\tseasonNumber\tepisodeNumber\n" +
	"tt0000013\ttt0000001\t2\t1\n" +
	"tt0000012\ttt0000001\t1\t12\n" +
	"tt0000011\ttt0000001\t1\t1\n" +
	"tt0000090\ttt0000001\t0\t1\n" +
	"tt0000099\ttt0000001\t\\N\t\\N\n" +
	"tt0000014\ttt0000001\t2\t2\n" +
	"tt0000201\ttt0000002\t1\t1\n"

func readyDataset(t *testing.T) *IMDbDataset {
	t.Helper()
	idx, err := parseEpisodeIndex(strings.NewReader(episodeRows))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	d := NewIMDbDataset(t.TempDir())
	d.episodes = idx
	d.episodesBuiltAt = time.Now()
	return d
}

func TestIMDbEpisodeCountsAcrossSeasonsWithoutSpecials(t *testing.T) {
	d := readyDataset(t)
	cases := []struct {
		season, episode int
		id              string
		absolute        int
	}{
		{1, 1, "tt0000011", 1},
		{1, 12, "tt0000012", 2},
		{2, 1, "tt0000013", 3},
		{2, 2, "tt0000014", 4},
	}
	for _, c := range cases {
		id, abs, perSeason, ok := d.IMDbEpisode("tt0000001", c.season, c.episode)
		if !ok || id != c.id || abs != c.absolute || len(perSeason) != 2 || perSeason[0] != 2 || perSeason[1] != 2 {
			t.Errorf("S%dE%d = %q %d %v %v, want %q %d [2 2]", c.season, c.episode, id, abs, perSeason, ok, c.id, c.absolute)
		}
	}
}

func TestIMDbEpisodeRefusesWhatItDoesNotHold(t *testing.T) {
	d := readyDataset(t)
	for _, q := range []struct {
		series          string
		season, episode int
	}{
		{"tt0000001", 3, 1}, {"tt0000001", 0, 1}, {"tt0000003", 1, 1}, {"tmdb:12", 1, 1}, {"tt0000001", 70000, 1},
	} {
		if id, _, _, ok := d.IMDbEpisode(q.series, q.season, q.episode); ok {
			t.Errorf("%s S%dE%d answered %q", q.series, q.season, q.episode, id)
		}
	}
}

func TestTheFirstLookupBuildsTheIndexInTheBackground(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		gz := gzip.NewWriter(w)
		_, _ = gz.Write([]byte(episodeRows))
		_ = gz.Close()
	}))
	t.Cleanup(srv.Close)
	d := NewIMDbDataset(t.TempDir())
	d.episodesURL = srv.URL

	if _, _, _, ok := d.IMDbEpisode("tt0000001", 2, 1); ok {
		t.Fatal("answered before the index existed")
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if id, _, _, ok := d.IMDbEpisode("tt0000001", 2, 1); ok {
			if id != "tt0000013" {
				t.Fatalf("id = %q", id)
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the index was never built")
}
