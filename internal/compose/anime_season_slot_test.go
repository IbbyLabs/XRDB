package compose

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"xrdb_rewrite/internal/provider/animemap"
)

// seasonSlotResolver answers SeasonForAnimeID from a fixed table keyed by the
// anime id and the series it is expected to belong to.
type seasonSlotResolver struct {
	rows map[string]map[string]animemap.SeasonMapping
	// seasons the dataset names for a series, so a real season is recognised as
	// one rather than bounded by its size.
	known map[string][]int
}

func (s seasonSlotResolver) KnowsTMDBSeason(seriesKey string, season int) bool {
	for _, n := range s.known[seriesKey] {
		if n == season {
			return true
		}
	}
	return false
}

// The pipeline's anime field is an animeResolver; the season lookup is an
// optional extra it is type-asserted for.
func (s seasonSlotResolver) Resolve(context.Context, string, string) (animemap.IDs, bool) {
	return animemap.IDs{}, false
}

func (s seasonSlotResolver) SeasonForAnimeID(animeID, seriesKey string) (animemap.SeasonMapping, animemap.SeasonRefusal) {
	bySeries, ok := s.rows[animeID]
	if !ok {
		return animemap.SeasonMapping{}, animemap.SeasonNoRows
	}
	m, ok := bySeries[seriesKey]
	if !ok {
		return animemap.SeasonMapping{}, animemap.SeasonWrongSeries
	}
	return m, animemap.SeasonResolved
}

func mappingFor(t *testing.T, season, delta int) animemap.SeasonMapping {
	t.Helper()
	// The struct's resolved flag is unexported, so a mapping is built through
	// the package rather than by hand.
	return animemap.NewSeasonMapping(season, delta)
}

// BUG-284. A caller outside XRDB joins a resolved IMDb id to the tail of a Kitsu
// episode id, so the catalogue id lands where a season number belongs and no
// series has a season 11209.
func TestAnAnimeIDInTheSeasonSlotIsConverted(t *testing.T) {
	p := &Pipeline{anime: seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{
		"kitsu:11209": {"tt5607616": mappingFor(t, 1, 0)},
	}}}

	season, episode, ok := p.recoverAnimeSeasonSlot(context.Background(), "tt5607616", 11209, 1)
	if !ok || season != 1 || episode != 1 {
		t.Errorf("got season %d episode %d recovered=%v, want 1/1 recovered", season, episode, ok)
	}
}

// The episode number counts from the season's first episode, so a mapping that
// packs several aired seasons into one TMDB season moves it.
func TestTheEpisodeOffsetIsApplied(t *testing.T) {
	p := &Pipeline{anime: seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{
		"kitsu:41182": {"tt5607616": mappingFor(t, 1, 25)},
	}}}

	season, episode, ok := p.recoverAnimeSeasonSlot(context.Background(), "tt5607616", 41182, 2)
	if !ok || season != 1 || episode != 27 {
		t.Errorf("got season %d episode %d recovered=%v, want 1/27 recovered", season, episode, ok)
	}
}

// The safety property: a number that maps to a different series is refused
// rather than rendering another programme's episode.
func TestAnIDBelongingToAnotherSeriesIsRefused(t *testing.T) {
	p := &Pipeline{anime: seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{
		"kitsu:11209": {"tt0000001": mappingFor(t, 4, 0)},
	}}}

	season, episode, ok := p.recoverAnimeSeasonSlot(context.Background(), "tt5607616", 11209, 1)
	if ok || season != 11209 || episode != 1 {
		t.Errorf("an id mapping to another series was accepted: season %d episode %d ok=%v", season, episode, ok)
	}
}

// A season the dataset names is never rewritten, even when that same number is
// also a catalogue id for the series. Otherwise a series with a small catalogue
// id would have its own seasons moved.
func TestASeasonTheDatasetNamesIsNeverConverted(t *testing.T) {
	p := &Pipeline{anime: seasonSlotResolver{
		rows:  map[string]map[string]animemap.SeasonMapping{"kitsu:2": {"tt5607616": mappingFor(t, 7, 0)}},
		known: map[string][]int{"tt5607616": {1, 2}},
	}}

	got, _, ok := p.recoverAnimeSeasonSlot(context.Background(), "tt5607616", 2, 1)
	if ok || got != 2 {
		t.Errorf("season 2 is a real season of this series and was rewritten to %d", got)
	}
}

// And the size of the number is not what decides it: a series genuinely
// numbered past any threshold keeps its season.
func TestALargeSeasonTheDatasetNamesIsKept(t *testing.T) {
	p := &Pipeline{anime: seasonSlotResolver{
		rows:  map[string]map[string]animemap.SeasonMapping{"kitsu:600": {"tt5607616": mappingFor(t, 1, 0)}},
		known: map[string][]int{"tt5607616": {600}},
	}}

	got, _, ok := p.recoverAnimeSeasonSlot(context.Background(), "tt5607616", 600, 1)
	if ok || got != 600 {
		t.Errorf("a season the dataset names was rewritten to %d", got)
	}
}

// Two services claiming the same number for one series, disagreeing about where
// it lands, is ambiguous and refuses rather than picking one.
func TestServicesDisagreeingAboutTheSameNumberRefuse(t *testing.T) {
	p := &Pipeline{anime: seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{
		"kitsu:11209": {"tt5607616": mappingFor(t, 1, 0)},
		"mal:11209":   {"tt5607616": mappingFor(t, 3, 0)},
	}}}

	season, _, ok := p.recoverAnimeSeasonSlot(context.Background(), "tt5607616", 11209, 1)
	if ok || season != 11209 {
		t.Errorf("an ambiguous number was converted to season %d", season)
	}
}

// A pipeline with no season resolver leaves the id alone rather than failing.
func TestNoResolverLeavesTheIDAlone(t *testing.T) {
	p := &Pipeline{}
	season, episode, ok := p.recoverAnimeSeasonSlot(context.Background(), "tt5607616", 11209, 1)
	if ok || season != 11209 || episode != 1 {
		t.Errorf("got %d/%d ok=%v, want the id untouched", season, episode, ok)
	}
}

// targetSeasonResolver answers both the target lookup resolveAnimeID needs and
// the season lookup, so a Kitsu episode id can be driven end to end.
type targetSeasonResolver struct {
	seasonSlotResolver
	targets map[string]animemap.Target
}

func (t targetSeasonResolver) ResolveTarget(_ context.Context, id string) (animemap.Target, bool) {
	tg, ok := t.targets[id]
	return tg, ok
}

// The other half of mrkaon's report. "kitsu:11209:1" resolved the series and
// then dropped the episode, because "tt5607616:1" is not a season and episode,
// so an episode thumbnail came back as series artwork.
func TestAKitsuEpisodeIDKeepsItsEpisode(t *testing.T) {
	p := &Pipeline{anime: targetSeasonResolver{
		seasonSlotResolver: seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{
			"kitsu:11209": {"tt5607616": mappingFor(t, 1, 0)},
		}},
		targets: map[string]animemap.Target{"kitsu:11209": {IMDb: "tt5607616"}},
	}}

	got := p.resolveAnimeID(context.Background(), Request{MediaType: "thumbnail", MediaID: "kitsu:11209:1"})
	if got.MediaID != "tt5607616:1:1" {
		t.Errorf("media id %q, want tt5607616:1:1", got.MediaID)
	}
}

// A season that starts partway through a TMDB season moves the episode number
// with it, or the second cour renders the first cour's episode.
func TestAKitsuEpisodeIDCarriesTheOffset(t *testing.T) {
	p := &Pipeline{anime: targetSeasonResolver{
		seasonSlotResolver: seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{
			"kitsu:41182": {"tt5607616": mappingFor(t, 1, 25)},
		}},
		targets: map[string]animemap.Target{"kitsu:41182": {IMDb: "tt5607616"}},
	}}

	got := p.resolveAnimeID(context.Background(), Request{MediaType: "thumbnail", MediaID: "kitsu:41182:2"})
	if got.MediaID != "tt5607616:1:27" {
		t.Errorf("media id %q, want tt5607616:1:27", got.MediaID)
	}
}

// Nothing to convert means the tail is dropped rather than a made-up season
// being asked for, which is what the code did before and is still correct.
func TestAnUnmappedAnimeSeasonDropsTheEpisode(t *testing.T) {
	p := &Pipeline{anime: targetSeasonResolver{
		seasonSlotResolver: seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{}},
		targets:            map[string]animemap.Target{"kitsu:99999": {IMDb: "tt5607616"}},
	}}

	got := p.resolveAnimeID(context.Background(), Request{MediaType: "thumbnail", MediaID: "kitsu:99999:1"})
	if got.MediaID != "tt5607616" {
		t.Errorf("media id %q, want the bare series id", got.MediaID)
	}
}

// A season and episode already in the id is left alone: it is not a bare
// absolute episode and needs no conversion.
func TestAnExplicitSeasonAndEpisodeIsUntouched(t *testing.T) {
	p := &Pipeline{anime: targetSeasonResolver{
		seasonSlotResolver: seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{}},
		targets:            map[string]animemap.Target{"kitsu:11209": {IMDb: "tt5607616"}},
	}}

	got := p.resolveAnimeID(context.Background(), Request{MediaType: "thumbnail", MediaID: "kitsu:11209:2:3"})
	if got.MediaID != "tt5607616:2:3" {
		t.Errorf("media id %q, want tt5607616:2:3", got.MediaID)
	}
}

// A declined recovery ends as a 404 with no artwork, so without a line saying
// why, the difference between a number that was never an anime id and one we
// held and could not use is invisible from outside.
func TestADeclinedRecoverySaysWhyWhenTheIDWasFound(t *testing.T) {
	var buf bytes.Buffer
	p := &Pipeline{
		logger: slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})),
		anime: seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{
			"kitsu:11209": {"tt9999999": mappingFor(t, 1, 0)},
		}},
	}

	if _, _, ok := p.recoverAnimeSeasonSlot(context.Background(), "tt5607616", 11209, 1); ok {
		t.Fatal("recovered against the wrong series, which the refusal exists to prevent")
	}
	out := buf.String()
	if !strings.Contains(out, "could not be converted") {
		t.Errorf("no info line for a found-but-unusable id, got %q", out)
	}
	if !strings.Contains(out, string(animemap.SeasonWrongSeries)) {
		t.Errorf("line does not name the refusal, got %q", out)
	}
}

// The same path is reached by every episode of every series the anime dataset
// has never heard of, so that case must stay off the info log.
func TestANumberThatIsNotAnAnimeIDIsSilentAtInfo(t *testing.T) {
	var buf bytes.Buffer
	p := &Pipeline{
		logger: slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})),
		anime:  seasonSlotResolver{rows: map[string]map[string]animemap.SeasonMapping{}},
	}

	if _, _, ok := p.recoverAnimeSeasonSlot(context.Background(), "tt5607616", 3, 18); ok {
		t.Fatal("recovered a season nothing maps, so the silence below proves nothing")
	}
	if out := buf.String(); out != "" {
		t.Errorf("an ordinary season number logged at info: %q", out)
	}
}
