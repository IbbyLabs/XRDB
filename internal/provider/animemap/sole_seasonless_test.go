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
		statedSeas: idx.statedSeasons, claims: idx.seasonClaims,
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

// BUG-286 case 2. Bleach's main entry names TMDB season 1 with no aired season,
// which keeps it out of the season index: seasons is keyed on the aired number.
// The mirror set is what makes the season it states reachable.
func TestAStatedSeasonIsReachableWhenNothingElseClaimsIt(t *testing.T) {
	m := seasonlessMapper(t)

	if _, why := m.SeasonForAnimeID("kitsu:244", "tt0434665"); why != SeasonNoRows {
		t.Fatalf("refusal = %q, want %q, otherwise this test proves nothing", why, SeasonNoRows)
	}
	got, ok := m.SoleClaimOfStatedSeason("kitsu:244", "tt0434665")
	if !ok || got != 1 {
		t.Errorf("stated season = %d ok=%v, want season 1", got, ok)
	}
}

// A TMDB season several entries share is a packed one, and which cour an id
// names is exactly what the missing aired number would have said.
func TestAStatedSeasonSharedWithAnotherEntryRefuses(t *testing.T) {
	idx, err := buildIndexes([]byte(`[
		{"type":"TV","kitsu_id":10,"imdb_id":["tt5"],"themoviedb_id":{"tv":5},"season":{"tmdb":1}},
		{"type":"TV","kitsu_id":11,"imdb_id":["tt5"],"themoviedb_id":{"tv":5},"season":{"tvdb":2,"tmdb":1},"episode_offset":{"tmdb":12}}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	m := &Mapper{primary: &source{
		byAnimeID: idx.reverse, bySeason: idx.seasons, partialSeas: idx.partialSeasons,
		animeSeas: idx.animeSeason, entriesPer: idx.seriesEntries,
		statedSeas: idx.statedSeasons, claims: idx.seasonClaims,
		loaded: true, loadedAt: time.Now(), ttl: time.Hour,
	}}
	if got, ok := m.SoleClaimOfStatedSeason("kitsu:10", "tt5"); ok {
		t.Errorf("placed into a shared season as %d; the offset is what is missing", got)
	}
	if m.NamesSeries("kitsu:10", "tt5") != true {
		t.Error("control: the id does name the series, so the refusal above is the sharing")
	}
}

// The id must name the series it is being placed against.
func TestAStatedSeasonAgainstAnotherSeriesRefuses(t *testing.T) {
	m := seasonlessMapper(t)
	if _, ok := m.SoleClaimOfStatedSeason("kitsu:244", "tt2098220"); ok {
		t.Error("placed Bleach's season against Hunter x Hunter")
	}
}
