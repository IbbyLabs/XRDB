package animemap

import (
	"testing"
	"time"
)

func episodeMapper(t *testing.T, data string) *Mapper {
	t.Helper()
	idx, err := buildIndexes([]byte(data))
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	return &Mapper{primary: &source{
		episodeRs: idx.episodeRows, tvMALs: idx.tvMAL,
		loaded: true, loadedAt: time.Now(), ttl: time.Hour,
	}}
}

// BUG-300. Samurai Champloo's one entry names no season, so its episodes map
// onto it by number.
func TestASoleSeasonlessTVEntryTakesTheEpisodeNumber(t *testing.T) {
	m := episodeMapper(t, `[
	  {"type":"TV","mal_id":205,"imdb_id":["tt0423731"],"themoviedb_id":{"tv":1063}},
	  {"type":"MOVIE","mal_id":999,"imdb_id":["tt0423731"],"themoviedb_id":{"tv":1063},"season":{"tvdb":0,"tmdb":0}}
	]`)
	for _, key := range []string{"tt0423731", "tv:1063"} {
		got, refusal := m.EpisodeEntry(key, 1, 5)
		if refusal != EpisodeResolved || got.MALID != 205 || got.Episode != 5 || !got.Unanchored {
			t.Errorf("EpisodeEntry(%s, 1, 5) = %+v, %q; want MAL 205 episode 5, unanchored", key, got, refusal)
		}
	}
}

// Two TV entries without seasons cannot be told apart, so neither is taken.
func TestTwoSeasonlessTVEntriesAreRefused(t *testing.T) {
	m := episodeMapper(t, `[
	  {"type":"TV","mal_id":1,"imdb_id":["tt9"],"themoviedb_id":{"tv":9}},
	  {"type":"TV","mal_id":2,"imdb_id":["tt9"],"themoviedb_id":{"tv":9}}
	]`)
	if got, refusal := m.EpisodeEntry("tt9", 1, 1); refusal == EpisodeResolved {
		t.Errorf("an ambiguous series resolved to %+v", got)
	}
}
