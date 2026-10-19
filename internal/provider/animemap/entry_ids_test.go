package animemap

import (
	"testing"
	"time"
)

// FR-233. Every season of a series resolves to one entry through Resolve, so a
// season asked for by its own id has to be looked up as that entry.
func TestEntryIDsKeepsTheSeasonsOwnIDs(t *testing.T) {
	data := []byte(`[
	  {"type":"TV","mal_id":54492,"anilist_id":161645,"kitsu_id":47083,
	   "imdb_id":["tt26743760"],"themoviedb_id":{"tv":220542},"season":{"tvdb":1,"tmdb":1}},
	  {"type":"TV","mal_id":58514,"anilist_id":176301,"kitsu_id":48649,
	   "imdb_id":["tt26743760"],"themoviedb_id":{"tv":220542},"season":{"tvdb":2,"tmdb":1},
	   "episode_offset":{"tmdb":24}}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	m := &Mapper{primary: &source{byAnimeID: idx.reverse, loaded: true, loadedAt: time.Now(), ttl: time.Hour}}

	for _, id := range []string{"kitsu:48649", "mal:58514", "anilist:176301"} {
		got, ok := m.EntryIDs(id)
		if !ok || got.MAL != 58514 || got.AniList != 176301 || got.Kitsu != 48649 {
			t.Errorf("EntryIDs(%q) = %+v ok=%v, want the second season's ids", id, got, ok)
		}
	}
	if _, ok := m.EntryIDs("kitsu:1"); ok {
		t.Error("an id the dataset does not carry resolved")
	}
}

func laterSeasonMapper(t *testing.T, data string) *Mapper {
	t.Helper()
	idx, err := buildIndexes([]byte(data))
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	return &Mapper{primary: &source{
		byAnimeID: idx.reverse, animeSeas: idx.animeSeason, bySeason: idx.seasons,
		loaded: true, loadedAt: time.Now(), ttl: time.Hour,
	}}
}

// FR-233. Only a TV season aired after another TV season of the same series
// gets a poster of its own.
func TestLaterSeasonKitsu(t *testing.T) {
	m := laterSeasonMapper(t, `[
	  {"type":"TV","mal_id":1,"kitsu_id":101,"imdb_id":["tt1"],"themoviedb_id":{"tv":10},"season":{"tvdb":1,"tmdb":1}},
	  {"type":"MOVIE","mal_id":2,"kitsu_id":102,"imdb_id":["tt1"],"themoviedb_id":{"tv":10},"season":{"tvdb":1,"tmdb":1}},
	  {"type":"TV","mal_id":3,"kitsu_id":103,"imdb_id":["tt1"],"themoviedb_id":{"tv":10},"season":{"tvdb":2,"tmdb":1},"episode_offset":{"tmdb":24}},
	  {"type":"TV","mal_id":4,"kitsu_id":104,"imdb_id":["tt1"],"themoviedb_id":{"tv":10},"season":{"tvdb":4,"tmdb":1},"episode_offset":{"tmdb":72}},
	  {"type":"OVA","mal_id":5,"kitsu_id":105,"imdb_id":["tt1"],"themoviedb_id":{"tv":10},"season":{"tvdb":3,"tmdb":1}},
	  {"type":"TV","mal_id":6,"kitsu_id":106,"imdb_id":["tt2"],"themoviedb_id":{"tv":20},"season":{"tvdb":1,"tmdb":1}}
	]`)
	cases := []struct {
		id    string
		kitsu int
		later bool
	}{
		{"kitsu:101", 0, false},  // first season
		{"kitsu:102", 0, false},  // a movie never counts
		{"kitsu:103", 103, true}, // second season
		{"mal:4", 104, true},     // a "Part 2", named by its MAL id
		{"kitsu:105", 0, false},  // an OVA
		{"kitsu:106", 0, false},  // a single-season show
		{"kitsu:999", 0, false},  // unknown
	}
	for _, tc := range cases {
		got, ok := m.LaterSeasonKitsu(tc.id)
		if ok != tc.later || got != tc.kitsu {
			t.Errorf("LaterSeasonKitsu(%q) = %d, %v; want %d, %v", tc.id, got, ok, tc.kitsu, tc.later)
		}
	}
}

// A TV row with no season of its own is not an earlier season of its series.
func TestLaterSeasonKitsuIgnoresASeasonlessRow(t *testing.T) {
	m := laterSeasonMapper(t, `[
	  {"type":"TV","mal_id":100,"kitsu_id":200,
	   "imdb_id":["tt0000001"],"themoviedb_id":{"tv":300}},
	  {"type":"TV","mal_id":101,"kitsu_id":201,
	   "imdb_id":["tt0000001"],"themoviedb_id":{"tv":300},"season":{"tvdb":1,"tmdb":1}}
	]`)
	if got, ok := m.LaterSeasonKitsu("kitsu:201"); ok {
		t.Errorf("season 1 beside a seasonless row was read as a later season, Kitsu %d", got)
	}
}
