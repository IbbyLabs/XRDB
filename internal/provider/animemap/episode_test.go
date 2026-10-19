package animemap

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// Rows follow the live Fribb shapes: Attack on Titan (TMDB 1429), Re:Zero
// (TMDB 65942, packed into season 1), One Piece (no season data), a season with
// two entries that carry no offset, and a season whose entries share an offset.
const episodeDataset = `[
  {"type":"TV","mal_id":35760,"kitsu_id":13569,"imdb_id":["tt2560140"],"themoviedb_id":{"tv":1429},"season":{"tvdb":3,"tmdb":3}},
  {"type":"TV","mal_id":38524,"kitsu_id":41982,"imdb_id":["tt2560140"],"themoviedb_id":{"tv":1429},"season":{"tvdb":3,"tmdb":3},"episode_offset":{"tvdb":12,"tmdb":12}},
  {"type":"TV","mal_id":31240,"kitsu_id":11209,"anilist_id":21355,"imdb_id":["tt5607616"],"themoviedb_id":{"tv":65942},"season":{"tvdb":1,"tmdb":1}},
  {"type":"TV","mal_id":39587,"imdb_id":["tt5607616"],"themoviedb_id":{"tv":65942},"season":{"tvdb":2,"tmdb":1},"episode_offset":{"tvdb":26,"tmdb":26}},
  {"type":"TV","mal_id":42203,"imdb_id":["tt5607616"],"themoviedb_id":{"tv":65942},"season":{"tvdb":2,"tmdb":1},"episode_offset":{"tvdb":38,"tmdb":38}},
  {"type":"TV","mal_id":54857,"imdb_id":["tt5607616"],"themoviedb_id":{"tv":65942},"season":{"tvdb":3,"tmdb":1},"episode_offset":{"tvdb":50,"tmdb":50}},
  {"type":"TV","mal_id":61316,"imdb_id":["tt5607616"],"themoviedb_id":{"tv":65942},"season":{"tvdb":4,"tmdb":1},"episode_offset":{"tvdb":66,"tmdb":66}},
  {"type":"TV","mal_id":21,"imdb_id":["tt0388629"],"themoviedb_id":{"tv":37854}},
  {"type":"TV","mal_id":7001,"imdb_id":["tt7000001"],"themoviedb_id":{"tv":7000},"season":{"tvdb":1,"tmdb":1}},
  {"type":"TV","mal_id":7002,"imdb_id":["tt7000001"],"themoviedb_id":{"tv":7000},"season":{"tvdb":2,"tmdb":1}},
  {"type":"TV","mal_id":7101,"imdb_id":["tt7100001"],"themoviedb_id":{"tv":7100},"season":{"tvdb":1,"tmdb":1},"episode_offset":{"tvdb":0,"tmdb":0}},
  {"type":"TV","mal_id":7102,"imdb_id":["tt7100001"],"themoviedb_id":{"tv":7100},"season":{"tvdb":2,"tmdb":1}},
  {"type":"OVA","mal_id":7201,"imdb_id":["tt7200001"],"themoviedb_id":{"tv":7200},"season":{"tvdb":1,"tmdb":1}},
  {"type":"TV","mal_id":7301,"imdb_id":["tt7300001"],"themoviedb_id":{"tv":7300},"season":{"tvdb":2,"tmdb":1},"episode_offset":{"tvdb":12,"tmdb":12}},
  {"type":"TV","mal_id":7401,"imdb_id":["tt7400001"],"themoviedb_id":{"tv":7400},"season":{"tvdb":0,"tmdb":0}}
]`

func TestEpisodeEntry(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(episodeDataset))
	}))
	defer srv.Close()
	m := newTestMapper(t, srv.URL, "")

	tests := []struct {
		name    string
		key     string
		season  int
		episode int
		want    EpisodeEntry
		refusal EpisodeRefusal
	}{
		{"AoT S3E1 is the first entry", "tt2560140", 3, 1, EpisodeEntry{MALID: 35760, Episode: 1}, EpisodeResolved},
		{"AoT S3E12 is still the first entry", "tt2560140", 3, 12, EpisodeEntry{MALID: 35760, Episode: 12}, EpisodeResolved},
		{"AoT S3E13 starts the second entry", "tt2560140", 3, 13, EpisodeEntry{MALID: 38524, Episode: 1}, EpisodeResolved},
		{"AoT S3E22 ends the second entry", "tt2560140", 3, 22, EpisodeEntry{MALID: 38524, Episode: 10}, EpisodeResolved},
		{"AoT by TMDB key", "tv:1429", 3, 13, EpisodeEntry{MALID: 38524, Episode: 1}, EpisodeResolved},
		{"Re:Zero first cour", "tt5607616", 1, 25, EpisodeEntry{MALID: 31240, Episode: 25}, EpisodeResolved},
		{"Re:Zero second season opens at 27", "tt5607616", 1, 27, EpisodeEntry{MALID: 39587, Episode: 1}, EpisodeResolved},
		{"Re:Zero second cour", "tt5607616", 1, 39, EpisodeEntry{MALID: 42203, Episode: 1}, EpisodeResolved},
		{"Re:Zero third season", "tt5607616", 1, 51, EpisodeEntry{MALID: 54857, Episode: 1}, EpisodeResolved},
		{"Re:Zero fourth season", "tt5607616", 1, 70, EpisodeEntry{MALID: 61316, Episode: 4}, EpisodeResolved},
		{"season 0 is refused", "tt2560140", 0, 1, EpisodeEntry{}, EpisodeSpecials},
		{"One Piece has no season data, so its one TV entry takes the number", "tt0388629", 1, 1000, EpisodeEntry{MALID: 21, Episode: 1000}, EpisodeResolved},
		{"unknown series", "tt0000001", 1, 1, EpisodeEntry{}, EpisodeNoRows},
		{"tvdb key is unmapped", "tvdb:81797", 1, 1, EpisodeEntry{}, EpisodeNoRows},
		{"season the series lacks", "tt2560140", 4, 1, EpisodeEntry{}, EpisodeNoSeasonRows},
		{"two entries without offsets", "tt7000001", 1, 5, EpisodeEntry{}, EpisodeAmbiguous},
		{"an explicit zero and a missing offset collide", "tt7100001", 1, 5, EpisodeEntry{}, EpisodeAmbiguous},
		{"an OVA is not a season", "tt7200001", 1, 1, EpisodeEntry{}, EpisodeNoRows},
		{"before a lone entry that starts late", "tt7300001", 1, 12, EpisodeEntry{}, EpisodeBeforeFirst},
		{"a lone entry that starts late", "tt7300001", 1, 13, EpisodeEntry{MALID: 7301, Episode: 1}, EpisodeResolved},
		{"a row with no TMDB season", "tt7400001", 1, 1, EpisodeEntry{}, EpisodeNoRows},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, refusal := m.EpisodeEntry(tt.key, tt.season, tt.episode)
			got = EpisodeEntry{MALID: got.MALID, Episode: got.Episode}
			if refusal != tt.refusal || got != tt.want {
				t.Errorf("EpisodeEntry(%q, %d, %d) = %+v, %q; want %+v, %q",
					tt.key, tt.season, tt.episode, got, refusal, tt.want, tt.refusal)
			}
		})
	}
}

func TestEpisodeEntryNamesThePreviousEntryInTheSeason(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(episodeDataset))
	}))
	defer srv.Close()
	m := newTestMapper(t, srv.URL, "")

	got, _ := m.EpisodeEntry("tt5607616", 1, 39)
	want := EpisodeEntry{MALID: 42203, Episode: 1, Offset: 38, HasPrev: true, PrevMALID: 39587, PrevOffset: 26}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
	if first, _ := m.EpisodeEntry("tt5607616", 1, 2); first.HasPrev || first.Offset != 0 {
		t.Errorf("the first entry has a predecessor: %+v", first)
	}
	if lone, _ := m.EpisodeEntry("tt7300001", 1, 13); lone.HasPrev || lone.Offset != 12 {
		t.Errorf("a lone late entry: %+v", lone)
	}
}

func TestMALIDForReadsTheRowsMALID(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(episodeDataset))
	}))
	defer srv.Close()
	m := newTestMapper(t, srv.URL, "")

	tests := []struct {
		id   string
		want int
		ok   bool
	}{
		{"mal:38524", 38524, true},
		{"kitsu:41982", 38524, true},
		{"kitsu:11209", 31240, true},
		{"anilist:21355", 31240, true},
		{"kitsu:999999", 0, false},
		{"tt2560140", 0, false},
	}
	for _, tt := range tests {
		got, ok := m.MALIDFor(tt.id)
		if got != tt.want || ok != tt.ok {
			t.Errorf("MALIDFor(%q) = %d, %v; want %d, %v", tt.id, got, ok, tt.want, tt.ok)
		}
	}
}
