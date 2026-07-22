package migrate

import (
	"encoding/json"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// decode reads a converted config back the way the render path does.
func surfaceOf(t *testing.T, raw json.RawMessage, surface string) imageconfig.Config {
	t.Helper()
	return imageconfig.ParseSurface(raw, surface)
}

func convert(t *testing.T, in string) json.RawMessage {
	t.Helper()
	out, _, err := ConvertConfig(json.RawMessage(in))
	if err != nil {
		t.Fatalf("ConvertConfig: %v", err)
	}
	return out
}

func TestConversionKeepsEveryOriginalKey(t *testing.T) {
	// The whole promise: a migrated profile still carries what the user had,
	// whether or not this version knows what to do with it.
	in := `{"posterRatingsMax":4,"posterIconShape":"squircle","communityBadgeTheme":"neon"}`
	out := convert(t, in)

	var before, after map[string]json.RawMessage
	_ = json.Unmarshal([]byte(in), &before)
	_ = json.Unmarshal(out, &after)
	for key, want := range before {
		got, ok := after[key]
		if !ok {
			t.Errorf("key %q was dropped by conversion", key)
			continue
		}
		if string(got) != string(want) {
			t.Errorf("key %q changed: %s -> %s", key, want, got)
		}
	}
}

func TestSurfacePrefixedKeysReachTheirSurface(t *testing.T) {
	out := convert(t, `{"posterRatingsMax":4,"backdropRatingsMax":9,"posterGenreBadgeScale":150}`)

	poster := surfaceOf(t, out, "poster")
	if poster.RatingsMax == nil || *poster.RatingsMax != 4 {
		t.Errorf("poster ratingsMax = %v, want 4", poster.RatingsMax)
	}
	if poster.GenreBadgeScale != 150 {
		t.Errorf("poster genreBadgeScale = %d, want 150", poster.GenreBadgeScale)
	}
	// The two surfaces carried different values in v2 and must stay apart.
	backdrop := surfaceOf(t, out, "backdrop")
	if backdrop.RatingsMax == nil || *backdrop.RatingsMax != 9 {
		t.Errorf("backdrop ratingsMax = %v, want 9", backdrop.RatingsMax)
	}
}

func TestUnprefixedKeysApplyToEverySurface(t *testing.T) {
	// v2 had both per-surface and global keys; a global one set the look
	// everywhere, so it has to land on every surface here.
	out := convert(t, `{"ratingBadgeScale":140}`)
	for _, s := range v2Surfaces {
		if got := surfaceOf(t, out, s).RatingBadgeScale; got != 140 {
			t.Errorf("%s ratingBadgeScale = %d, want 140", s, got)
		}
	}
}

func TestRatingSourceIDsAreRenamed(t *testing.T) {
	// v2 spelled three sources differently. Left alone they would silently
	// vanish from the poster, which reads as losing the setting.
	out := convert(t, `{"posterRatingPreferences":["imdb","tomatoes","tomatoesaudience","myanimelist","letterboxd"]}`)
	got := surfaceOf(t, out, "poster").Ratings
	want := []string{"imdb", "rt", "rtaudience", "mal", "letterboxd"}
	if len(got) != len(want) {
		t.Fatalf("ratings = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("ratings[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestProviderWeightsBecomeSharesWithTheSameBalance(t *testing.T) {
	// v2 weighted by multiplier and counted an unweighted source once, so
	// {imdb:3} across three sources meant 3:1:1. As shares of 100 that is
	// 60/20/20, which is the same balance rather than the same numbers.
	out := convert(t, `{
		"posterRatingPreferences":["imdb","tmdb","tomatoes"],
		"posterAggregateProviderWeights":{"imdb":3}
	}`)
	got := surfaceOf(t, out, "poster").RatingProviderWeights
	want := map[string]float64{"imdb": 60, "tmdb": 20, "rt": 20}
	if len(got) != len(want) {
		t.Fatalf("weights = %v, want %v", got, want)
	}
	var total float64
	for source, share := range want {
		if got[source] != share {
			t.Errorf("weight[%s] = %v, want %v", source, got[source], share)
		}
		total += got[source]
	}
	if total != 100 {
		t.Errorf("shares total %v, want 100", total)
	}
}

func TestProviderWeightsFromAStringConfig(t *testing.T) {
	// v2 config links carried weights as "imdb:3,tmdb:1" rather than an object.
	out := convert(t, `{
		"posterRatingPreferences":["imdb","tmdb"],
		"posterAggregateProviderWeights":"imdb:3,tmdb:1"
	}`)
	got := surfaceOf(t, out, "poster").RatingProviderWeights
	if got["imdb"] != 75 || got["tmdb"] != 25 {
		t.Errorf("weights = %v, want imdb 75 / tmdb 25", got)
	}
}

func TestWeightSourceIDsAreRenamedToo(t *testing.T) {
	out := convert(t, `{
		"posterRatingPreferences":["tomatoes","imdb"],
		"posterAggregateProviderWeights":{"tomatoes":3,"imdb":1}
	}`)
	got := surfaceOf(t, out, "poster").RatingProviderWeights
	if got["rt"] != 75 {
		t.Errorf("weights = %v, want the renamed rt on 75", got)
	}
	if _, stale := got["tomatoes"]; stale {
		t.Errorf("weights kept the v2 spelling: %v", got)
	}
}

func TestSharesAlwaysTotalOneHundred(t *testing.T) {
	// Three equal sources cannot divide 100 evenly, and a split that came to 99
	// would quietly change every score it touched.
	out := convert(t, `{
		"posterRatingPreferences":["imdb","tmdb","rt"],
		"posterAggregateProviderWeights":{"imdb":1,"tmdb":1,"rt":1}
	}`)
	got := surfaceOf(t, out, "poster").RatingProviderWeights
	var total float64
	for _, v := range got {
		total += v
	}
	if total != 100 {
		t.Errorf("shares = %v, total %v, want 100", got, total)
	}
}

func TestAllZeroWeightsAreDropped(t *testing.T) {
	// v2 read an all-zero map as "no weighting" and showed the plain average.
	// Carrying it over literally would blank the score instead, so the setting
	// is dropped rather than inverted.
	out := convert(t, `{
		"posterRatingPreferences":["imdb","tmdb"],
		"posterAggregateProviderWeights":{"imdb":0,"tmdb":0}
	}`)
	if got := surfaceOf(t, out, "poster").RatingProviderWeights; len(got) != 0 {
		t.Errorf("weights = %v, want none", got)
	}
}

func TestAlreadyConvertedConfigIsLeftAlone(t *testing.T) {
	// Running a migration twice must not wrap an envelope in another envelope.
	in := `{"surfaces":{"poster":{"ratingsMax":3}}}`
	out, stats, err := ConvertConfig(json.RawMessage(in))
	if err != nil {
		t.Fatalf("ConvertConfig: %v", err)
	}
	if stats.Converted != 0 {
		t.Errorf("converted %d fields on an XRDB config, want 0", stats.Converted)
	}
	if string(out) != in {
		t.Errorf("config was rewritten: %s", out)
	}
}

func TestConfigWithNothingToConvertIsUntouched(t *testing.T) {
	in := `{"communityBadgeTheme":"neon"}`
	out, stats, err := ConvertConfig(json.RawMessage(in))
	if err != nil {
		t.Fatalf("ConvertConfig: %v", err)
	}
	if stats.Converted != 0 || string(out) != in {
		t.Errorf("config changed with nothing to convert: %s (%d converted)", out, stats.Converted)
	}
}

func TestConversionIsIdempotent(t *testing.T) {
	// A profile migrated twice has to come out the same, or a re-run of the
	// tool would change what someone is already looking at.
	once := convert(t, `{"posterRatingsMax":4,"posterRatingPreferences":["tomatoes"]}`)
	twice, _, err := ConvertConfig(once)
	if err != nil {
		t.Fatalf("second ConvertConfig: %v", err)
	}
	if string(twice) != string(once) {
		t.Errorf("second conversion differed:\n once: %s\ntwice: %s", once, twice)
	}
}

func TestMalformedConfigIsRefusedNotMangled(t *testing.T) {
	if _, _, err := ConvertConfig(json.RawMessage(`["not","an","object"]`)); err == nil {
		t.Error("expected an error for a non-object config")
	}
}

func TestEveryRenameTargetIsSomethingXRDBModels(t *testing.T) {
	// A rename pointing at a key XRDB does not model would quietly drop the
	// setting on the floor, which is the one thing this must never do.
	for from, to := range v2BaseRenames {
		if !imageconfig.IsModeledKey(to) {
			t.Errorf("rename %q -> %q targets a key XRDB does not model", from, to)
		}
	}
}

func TestAKeyXRDBAlreadyKnowsIsNotSplitApart(t *testing.T) {
	// "logoBackground" is a whole setting name that happens to start with a
	// surface name; reading it as "background" on the logo surface loses it.
	out := convert(t, `{"logoBackground":"dark"}`)
	for _, s := range v2Surfaces {
		if got := surfaceOf(t, out, s).LogoBackground; got != "dark" {
			t.Errorf("%s logoBackground = %q, want dark", s, got)
		}
	}
}

func TestGlobalRenamesReachEverySurface(t *testing.T) {
	out := convert(t, `{"lang":"ja","posterImageSize":"large","posterImageText":"textless"}`)
	poster := surfaceOf(t, out, "poster")
	if poster.Language != "ja" {
		t.Errorf("language = %q, want ja", poster.Language)
	}
	if string(poster.Size) != "large" {
		t.Errorf("size = %q, want large", poster.Size)
	}
	if string(poster.TextPreference) != "textless" {
		t.Errorf("textPreference = %q, want textless", poster.TextPreference)
	}
	// "lang" had no surface prefix in v2, so it set the language everywhere.
	if got := surfaceOf(t, out, "logo").Language; got != "ja" {
		t.Errorf("logo language = %q, want ja", got)
	}
}
