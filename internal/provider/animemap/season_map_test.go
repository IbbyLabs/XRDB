package animemap

import (
	"testing"
	"time"
)

// Rows taken from the live Fribb dataset rather than invented, so a change in
// its shape shows up here rather than in production.
var (
	// tt5607616: four aired seasons packed into TMDB season 1, and aired season
	// 2 split into two cours.
	packedSeries = []seasonRow{
		{aired: 1, tmdbSeason: 1},
		{aired: 2, tmdbSeason: 1, offset: 26, hasOffset: true},
		{aired: 2, tmdbSeason: 1, offset: 38, hasOffset: true},
		{aired: 3, tmdbSeason: 1, offset: 50, hasOffset: true},
		{aired: 4, tmdbSeason: 1, offset: 66, hasOffset: true},
	}
	// tt11448214: six aired seasons packed, one row each.
	cleanPacked = []seasonRow{
		{aired: 1, tmdbSeason: 1},
		{aired: 2, tmdbSeason: 1, offset: 12, hasOffset: true},
		{aired: 3, tmdbSeason: 1, offset: 24, hasOffset: true},
	}
	// tt0434665: aired season 17 owns TMDB season 2 alone, described by four
	// rows whose offsets mark cours inside it.
	exclusiveMultiRow = []seasonRow{
		{aired: 1, tmdbSeason: 1},
		{aired: 17, tmdbSeason: 2},
		{aired: 17, tmdbSeason: 2, offset: 13, hasOffset: true},
		{aired: 17, tmdbSeason: 2, offset: 26, hasOffset: true},
		{aired: 17, tmdbSeason: 2, offset: 40, hasOffset: true},
	}
	// tt0435972: one row owning its season and carrying an offset. The air
	// dates do not say what it counts from.
	exclusiveWithOffset = []seasonRow{
		{aired: 1, tmdbSeason: 1, offset: 1, hasOffset: true},
	}
)

func TestMapSeason(t *testing.T) {
	cases := []struct {
		name  string
		rows  []seasonRow
		aired int
		want  SeasonMapping
		why   SeasonRefusal
	}{
		// Packed: the episodes of several aired seasons run end to end, so the
		// number has to move.
		{"packed, later season", cleanPacked, 3, SeasonMapping{TMDBSeason: 1, EpisodeDelta: 24, resolved: true}, SeasonResolved},
		{"packed, second season", cleanPacked, 2, SeasonMapping{TMDBSeason: 1, EpisodeDelta: 12, resolved: true}, SeasonResolved},
		{"packed, first season starts where TMDB does", cleanPacked, 1, SeasonMapping{TMDBSeason: 1, resolved: true}, SeasonResolved},

		// Exclusive: one aired season owns the TMDB season, so the numbering
		// already agrees and the offsets describe something else.
		{"exclusive, offsets mark cours", exclusiveMultiRow, 17, SeasonMapping{TMDBSeason: 2, resolved: true}, SeasonResolved},
		{"exclusive, no offset", exclusiveMultiRow, 1, SeasonMapping{TMDBSeason: 1, resolved: true}, SeasonResolved},

		// Refusals. A wrong episode renders a plausible still nobody reports,
		// which is worse than the placeholder a refusal serves.
		{"packed season split into cours", packedSeries, 2, SeasonMapping{}, SeasonSplitIntoCours},
		{"exclusive single row carrying an offset", exclusiveWithOffset, 1, SeasonMapping{}, SeasonAmbiguousOffset},

		// Nothing recorded for that season.
		{"unknown aired season", cleanPacked, 9, SeasonMapping{}, SeasonUnknownAired},
		{"no rows at all", nil, 1, SeasonMapping{}, SeasonUnknownAired},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, why := mapSeason(tc.rows, tc.aired)
			if why != tc.why {
				t.Fatalf("mapSeason(%d) refusal = %q, want %q", tc.aired, why, tc.why)
			}
			if got != tc.want {
				t.Errorf("mapSeason(%d) = %+v, want %+v", tc.aired, got, tc.want)
			}
		})
	}
}

// One aired season filed under two TMDB seasons has no single answer, and
// picking the first would be a coin toss rendered as a fact.
func TestMapSeasonRefusesAContradiction(t *testing.T) {
	rows := []seasonRow{
		{aired: 2, tmdbSeason: 1, offset: 12, hasOffset: true},
		{aired: 2, tmdbSeason: 3},
		{aired: 1, tmdbSeason: 1},
	}
	if got, why := mapSeason(rows, 2); why != SeasonContradictory {
		t.Errorf("a season under two TMDB seasons gave %+v / %q, want a contradiction refusal", got, why)
	}
}

// The packed test above would pass on a mapper that ignored the offset entirely
// if every fixture had a zero one, so this pins that the offset is read.
func TestPackedSeasonMovesTheEpisodeNumber(t *testing.T) {
	got, why := mapSeason(cleanPacked, 3)
	if why != SeasonResolved {
		t.Fatalf("a packed season refused with %q", why)
	}
	if got.EpisodeDelta == 0 {
		t.Error("a packed later season moved the episode number by zero")
	}
}

func TestSeasonRefKeepsBothNumbers(t *testing.T) {
	var s seasonRef
	if err := s.UnmarshalJSON([]byte(`{"tvdb":17,"tmdb":2}`)); err != nil {
		t.Fatal(err)
	}
	if s.tvdb != 17 || s.tmdb != 2 {
		t.Errorf("tvdb/tmdb = %d/%d, want 17/2", s.tvdb, s.tmdb)
	}
	// A bare number names the same season on both sides.
	var b seasonRef
	if err := b.UnmarshalJSON([]byte(`3`)); err != nil {
		t.Fatal(err)
	}
	if b.tvdb != 3 || b.tmdb != 3 {
		t.Errorf("bare season gave %d/%d, want 3/3", b.tvdb, b.tmdb)
	}
}

func TestOffsetRefDecodes(t *testing.T) {
	cases := []struct {
		name, in string
		want     int
		set      bool
	}{
		{"both sides", `{"tvdb":13,"tmdb":13}`, 13, true},
		{"tmdb only", `{"tmdb":66}`, 66, true},
		{"tvdb only falls back", `{"tvdb":9}`, 9, true},
		{"bare number", `40`, 40, true},
		{"absent", `null`, 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var o offsetRef
			if err := o.UnmarshalJSON([]byte(tc.in)); err != nil {
				t.Fatal(err)
			}
			if o.tmdb != tc.want || o.set != tc.set {
				t.Errorf("offsetRef(%s) = %d/%v, want %d/%v", tc.in, o.tmdb, o.set, tc.want, tc.set)
			}
		})
	}
}

// Packing is judged by scanning a season's siblings. A sibling naming no TMDB
// season cannot be scanned, so a packed season could read as exclusive and pass
// an episode number through unchanged. The series is refused instead.
func TestAPartialSeriesIsRefusedRatherThanScannedFromWhatIsLeft(t *testing.T) {
	idx, err := buildIndexes([]byte(`[
		{"type":"TV","mal_id":1,"imdb_id":["tt9"],"season":{"tvdb":1,"tmdb":1}},
		{"type":"TV","mal_id":2,"imdb_id":["tt9"],"season":{"tvdb":2}},
		{"type":"TV","mal_id":3,"imdb_id":["tt8"],"season":{"tvdb":1,"tmdb":1}}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	if !idx.partialSeasons["tt9"] {
		t.Error("a series with an aired season and no TMDB season was not marked partial")
	}
	// Control: the neighbouring series is complete and keeps its rows, so the
	// mark is about the data rather than about indexing failing wholesale.
	if idx.partialSeasons["tt8"] {
		t.Error("control: a complete series was marked partial")
	}
	if len(idx.seasons["tt8"]) != 1 {
		t.Errorf("control: complete series holds %d rows, want 1", len(idx.seasons["tt8"]))
	}
}

// The partial-series refusal is returned by SeasonFor rather than mapSeason, so
// the table above cannot reach it.
func TestSeasonForRefusesAPartialSeries(t *testing.T) {
	src := &source{
		bySeason:    map[string][]seasonRow{"tt9": {{aired: 1, tmdbSeason: 1}}},
		partialSeas: map[string]bool{"tt9": true},
		loaded:      true,
		loadedAt:    time.Now(),
		ttl:         time.Hour,
	}
	m := &Mapper{primary: src}
	if _, why := m.SeasonFor("tt9", 1); why != SeasonPartialSeries {
		t.Errorf("refusal = %q, want %q", why, SeasonPartialSeries)
	}
	// Control: the same row resolves once the series is not marked partial, so
	// the refusal is the mark rather than the lookup failing.
	src.partialSeas = map[string]bool{}
	if got, why := m.SeasonFor("tt9", 1); why != SeasonResolved || got.TMDBSeason != 1 {
		t.Errorf("control: unmarked series gave %+v / %q, want season 1 resolved", got, why)
	}
	// A series with nothing recorded is a different refusal from a refused one.
	if _, why := m.SeasonFor("tt404", 1); why != SeasonNoRows {
		t.Errorf("unknown series refusal = %q, want %q", why, SeasonNoRows)
	}
}

// A caller that ignores the refusal gets a mapping naming TMDB season 0, which
// is the specials season and a real request. Resolved is what stops that being
// mistaken for an answer.
func TestAnIgnoredRefusalIsNotUsable(t *testing.T) {
	got, _ := mapSeason(exclusiveWithOffset, 1)
	if got.Resolved() {
		t.Error("a refused mapping reports itself resolved")
	}
	if got.TMDBSeason != 0 {
		t.Fatalf("setup: refused mapping names season %d, expected the zero value", got.TMDBSeason)
	}
	// Control: a real conversion does report resolved, so the check above is
	// about the refusal rather than Resolved always being false.
	ok, why := mapSeason(cleanPacked, 3)
	if why != SeasonResolved || !ok.Resolved() {
		t.Errorf("control: a resolved mapping gave %q / resolved=%v", why, ok.Resolved())
	}
}

// mrkaon's report: AIOMetadata fills {season} from the middle segment of a
// Stremio anime id, so tt5607616:42198:1 arrives with a Kitsu id where a season
// belongs. Rows are the live ones for that title.
func mapperWithSeasons(t *testing.T) *Mapper {
	t.Helper()
	idx, err := buildIndexes([]byte(`[
		{"type":"TV","kitsu_id":11209,"imdb_id":["tt5607616"],"themoviedb_id":{"tv":65942},"season":{"tvdb":1,"tmdb":1}},
		{"type":"TV","kitsu_id":42198,"imdb_id":["tt5607616"],"themoviedb_id":{"tv":65942},"season":{"tvdb":2,"tmdb":1},"episode_offset":{"tmdb":26}},
		{"type":"TV","kitsu_id":47235,"imdb_id":["tt5607616"],"themoviedb_id":{"tv":65942},"season":{"tvdb":3,"tmdb":1},"episode_offset":{"tmdb":50}},
		{"type":"TV","kitsu_id":99999,"imdb_id":["tt0000001"],"themoviedb_id":{"tv":11},"season":{"tvdb":2,"tmdb":1},"episode_offset":{"tmdb":7}},
		{"type":"TV","kitsu_id":99998,"imdb_id":["tt0000001"],"themoviedb_id":{"tv":11},"season":{"tvdb":1,"tmdb":1}}
	]`))
	if err != nil {
		t.Fatal(err)
	}
	return &Mapper{primary: &source{
		bySeason: idx.seasons, partialSeas: idx.partialSeasons, animeSeas: idx.animeSeason,
		loaded: true, loadedAt: time.Now(), ttl: time.Hour,
	}}
}

func TestSeasonForAnimeID(t *testing.T) {
	m := mapperWithSeasons(t)

	// Season 2's own Kitsu id, so episode 1 is episode 27 of TMDB's season 1.
	got, why := m.SeasonForAnimeID("kitsu:42198", "tt5607616")
	if why != SeasonResolved {
		t.Fatalf("refusal = %q, want resolved", why)
	}
	if got.TMDBSeason != 1 || got.EpisodeDelta != 26 {
		t.Errorf("mapping = %+v, want season 1 delta 26", got)
	}

	// The first season carries no offset, so its numbering already matches.
	if got, why := m.SeasonForAnimeID("kitsu:11209", "tt5607616"); why != SeasonResolved || got.EpisodeDelta != 0 {
		t.Errorf("first season gave %+v / %q, want delta 0 resolved", got, why)
	}

	// A recovery landing on another title would render the wrong series, which
	// is the failure this whole path exists to avoid.
	if _, why := m.SeasonForAnimeID("kitsu:99999", "tt5607616"); why != SeasonWrongSeries {
		t.Errorf("refusal = %q, want %q", why, SeasonWrongSeries)
	}
	// Control: the same id resolves against its own series, so the refusal above
	// is the mismatch rather than the id being unknown.
	if _, why := m.SeasonForAnimeID("kitsu:99999", "tt0000001"); why != SeasonResolved {
		t.Errorf("control: own series gave %q, want resolved", why)
	}

	// An id nothing records, and something that is not an anime id at all.
	if _, why := m.SeasonForAnimeID("kitsu:1234567", "tt5607616"); why != SeasonNoRows {
		t.Errorf("unknown id refusal = %q, want %q", why, SeasonNoRows)
	}
	if _, why := m.SeasonForAnimeID("tt5607616", "tt5607616"); why != SeasonNoRows {
		t.Errorf("non-anime id refusal = %q, want %q", why, SeasonNoRows)
	}

	// The series check is the only thing stopping a recovery landing on another
	// title, so an absent series refuses rather than proceeding unchecked.
	if _, why := m.SeasonForAnimeID("kitsu:42198", ""); why != SeasonNoSeriesKey {
		t.Errorf("empty series refusal = %q, want %q", why, SeasonNoSeriesKey)
	}
	// Control: the same id with its series resolves, so the refusal above is the
	// missing key rather than the id.
	if _, why := m.SeasonForAnimeID("kitsu:42198", "tt5607616"); why != SeasonResolved {
		t.Errorf("control: with a series key it gave %q, want resolved", why)
	}
}
