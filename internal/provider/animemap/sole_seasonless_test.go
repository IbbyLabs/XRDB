package animemap

import (
	"testing"
	"time"
)

// Entries in the live shapes: Hunter x Hunter states no season at all and is the
// only entry for its series; Bleach's main entry states a TMDB season with no
// aired one; a two-entry series states neither.
func seasonlessMapper(t *testing.T) *Mapper {
	t.Helper()
	idx, err := buildIndexes([]byte(`[
		{"type":"TV","kitsu_id":6448,"mal_id":11061,"imdb_id":["tt2098220"],"themoviedb_id":{"tv":46298}},
		{"type":"TV","kitsu_id":244,"mal_id":269,"imdb_id":["tt0434665"],"themoviedb_id":{"tv":30984},"season":{"tmdb":1}},
		{"type":"TV","kitsu_id":43078,"imdb_id":["tt0434665"],"themoviedb_id":{"tv":30984},"season":{"tvdb":17,"tmdb":2}},
		{"type":"TV","kitsu_id":700,"imdb_id":["tt7777777"],"themoviedb_id":{"tv":77}},
		{"type":"TV","kitsu_id":701,"imdb_id":["tt7777777"],"themoviedb_id":{"tv":77}}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	return &Mapper{primary: &source{
		byAnimeID: idx.reverse, bySeason: idx.seasons, partialSeas: idx.partialSeasons,
		animeSeas: idx.animeSeason, entriesPer: idx.seriesEntries,
		loaded: true, loadedAt: time.Now(), ttl: time.Hour,
	}}
}

// An entry absent from the season index refuses as no_rows whether or not it is
// an anime id, so the reverse index is what tells the two apart.
func TestNamesSeriesSeesWhatTheSeasonIndexCannot(t *testing.T) {
	m := seasonlessMapper(t)

	if _, why := m.SeasonForAnimeID("kitsu:6448", "tt2098220"); why != SeasonNoRows {
		t.Fatalf("refusal = %q, want %q, otherwise this test proves nothing", why, SeasonNoRows)
	}
	if !m.NamesSeries("kitsu:6448", "tt2098220") {
		t.Error("kitsu:6448 does name tt2098220, and the season index cannot say so")
	}
	if !m.NamesSeries("kitsu:244", "tt0434665") {
		t.Error("kitsu:244 does name tt0434665")
	}
	if m.NamesSeries("kitsu:6448", "tt0434665") {
		t.Error("kitsu:6448 named the wrong series, which is what the check exists to refuse")
	}
	if m.NamesSeries("kitsu:99999999", "tt2098220") {
		t.Error("a number that is no anime id named a series")
	}
}

func TestSoleSeasonlessSeriesIsNarrow(t *testing.T) {
	m := seasonlessMapper(t)

	if !m.SoleSeasonlessSeries("kitsu:6448", "tt2098220") {
		t.Error("the only entry for a series recording no season should place as its first")
	}
	// Bleach records a season through its other entry, so it is a different case
	// and this must not touch it.
	if m.SoleSeasonlessSeries("kitsu:244", "tt0434665") {
		t.Error("a series with a recorded season was placed by elimination")
	}
	// Two entries, neither recording a season: which is first is exactly what
	// the missing data would have said.
	if m.SoleSeasonlessSeries("kitsu:700", "tt7777777") {
		t.Error("a series with two entries was placed by elimination")
	}
	if m.SoleSeasonlessSeries("kitsu:6448", "tt0434665") {
		t.Error("placed an id against a series it does not name")
	}
}
