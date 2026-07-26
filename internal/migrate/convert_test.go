package migrate

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

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

func TestOutputEnvelopeMatchesWhatImportExpects(t *testing.T) {
	// The migrated file is meant to be posted straight at /profile/import. A
	// bare array parsed as an envelope yields no profiles, which is how the
	// documented migration command came to fail with "invalid JSON".
	profiles := []OutputProfile{{Version: 1, ID: "p1", Type: "poster", Config: json.RawMessage(`{}`)}}
	encoded, err := json.Marshal(OutputEnvelope{Version: 1, Profiles: profiles})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	// Mirrors profile.ExportEnvelope without importing the store package.
	var envelope struct {
		Version  int               `json:"version"`
		Profiles []json.RawMessage `json:"profiles"`
	}
	if err := json.Unmarshal(encoded, &envelope); err != nil {
		t.Fatalf("migrated output does not parse as an import envelope: %v", err)
	}
	if envelope.Version != 1 || len(envelope.Profiles) != 1 {
		t.Errorf("envelope = %+v, want version 1 with one profile", envelope)
	}
}

func TestOneBadValueDoesNotTakeTheSurfaceWithIt(t *testing.T) {
	// XRDB reads a config all-or-nothing: one value of the wrong JSON type and
	// it falls back to defaults for everything. A v2 value that changed shape
	// between versions must cost only itself.
	out := convert(t, `{
		"posterRatingsMax": 4,
		"posterRatingBadgeScale": 150,
		"posterGenre": "yes-please"
	}`)
	poster := surfaceOf(t, out, "poster")
	if poster.RatingsMax == nil || *poster.RatingsMax != 4 {
		t.Errorf("ratingsMax = %v, want 4 kept despite a bad sibling", poster.RatingsMax)
	}
	if poster.RatingBadgeScale != 150 {
		t.Errorf("ratingBadgeScale = %d, want 150 kept despite a bad sibling", poster.RatingBadgeScale)
	}
	// And the bad one is still on the profile, just not in the envelope.
	var all map[string]json.RawMessage
	if err := json.Unmarshal(out, &all); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := all["posterGenre"]; !ok {
		t.Error("the unreadable value was dropped from the profile entirely")
	}
}

func TestASurfaceOfNothingButBadValuesStillLeavesTheProfileIntact(t *testing.T) {
	out := convert(t, `{"posterGenre":"yes-please","posterAgeRating":"maybe"}`)
	var all map[string]json.RawMessage
	if err := json.Unmarshal(out, &all); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, key := range []string{"posterGenre", "posterAgeRating"} {
		if _, ok := all[key]; !ok {
			t.Errorf("key %q was lost", key)
		}
	}
}

func TestWordSettingsBecomeFlags(t *testing.T) {
	// v2 switched streaming badges with a word. Copied across as a string it
	// would be unreadable and pruned, quietly losing the setting.
	on := convert(t, `{"posterStreamBadges":"auto"}`)
	if !surfaceOf(t, on, "poster").Providers {
		t.Error("streamBadges auto should turn providers on")
	}
	off := convert(t, `{"posterStreamBadges":"off"}`)
	if surfaceOf(t, off, "poster").Providers {
		t.Error("streamBadges off should leave providers off")
	}
}

func TestRatingStyleMapsWhereXRDBHasTheStyle(t *testing.T) {
	square := convert(t, `{"posterRatingStyle":"square"}`)
	if got := surfaceOf(t, square, "poster").BadgeStyle; string(got) != "square" {
		t.Errorf("badgeStyle = %q, want square", got)
	}
	// Every style v2 offers now has a rendering here, so each one carries over
	// rather than reverting to the default the user never chose.
	for _, style := range []string{"square", "plain", "stacked", "tile"} {
		got := surfaceOf(t, convert(t, `{"posterRatingStyle":"`+style+`"}`), "poster").BadgeStyle
		if string(got) != style {
			t.Errorf("badgeStyle %q carried over as %q", style, got)
		}
	}
	// v2 drew "glass" as a filled capsule with a coloured icon plate. XRDB
	// spells that "pill"; its own "glass" is a transparent outline.
	got := surfaceOf(t, convert(t, `{"posterRatingStyle":"glass"}`), "poster").BadgeStyle
	if string(got) != "pill" {
		t.Errorf("v2 glass became %q, want pill", got)
	}
}

// The glass remap keys off v2's "ratingStyle". A config already written in
// XRDB's own spelling names a style XRDB has, so it passes through untouched.
func TestNativeGlassSurvivesConversion(t *testing.T) {
	in := `{"badgeStyle":"glass","language":"fr"}`
	out := convert(t, in)
	var got map[string]json.RawMessage
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if s := string(got["badgeStyle"]); s != `"glass"` {
		t.Errorf("badgeStyle = %s, want \"glass\"", s)
	}
}

func TestCredentialsInAV2ProfileAreFlaggedNotRemoved(t *testing.T) {
	// v2 kept API keys on the profile. They are preserved like everything else,
	// which means they travel into an export too, so the report has to say so.
	input := LegacyEnvelope{Profiles: []map[string]json.RawMessage{{
		"id":     json.RawMessage(`"p1"`),
		"type":   json.RawMessage(`"poster"`),
		"config": json.RawMessage(`{"tmdbKey":"secret-value","mdblistKey":"","posterRatingsMax":3}`),
	}}}
	out, report, err := MigrateLegacyProfiles(input, "src", time.Unix(0, 0))
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if len(report.CredentialConfigFields) != 1 || report.CredentialConfigFields[0].Field != "tmdbKey" {
		t.Errorf("credential fields = %+v, want just tmdbKey", report.CredentialConfigFields)
	}
	// A blank key is nothing to warn about.
	for _, f := range report.CredentialConfigFields {
		if f.Field == "mdblistKey" {
			t.Error("an empty credential field was flagged")
		}
	}
	// And it is still there: flagging is not removing.
	if !strings.Contains(string(out[0].Config), "secret-value") {
		t.Error("the credential was stripped rather than preserved")
	}
}

func TestTheRatingValueModeReachesEverySurface(t *testing.T) {
	// v2 stored this as one shared field, so every surface has to inherit it.
	out := convert(t, `{"ratingValueMode":"normalizedclean"}`)

	for _, surface := range v2Surfaces {
		if got := surfaceOf(t, out, surface).RatingValueMode; got != "normalizedclean" {
			t.Errorf("%s rating value mode = %q, want normalizedclean", surface, got)
		}
	}
}

func TestAHyphenatedRatingValueModeStillConverts(t *testing.T) {
	out := convert(t, `{"ratingValueMode":"normalized-100"}`)

	if got := surfaceOf(t, out, "poster").RatingValueMode; got != "normalized100" {
		t.Errorf("poster rating value mode = %q, want normalized100", got)
	}
}

func TestV2GenreBadgeTurnsIntoTheGenreFlagAndMode(t *testing.T) {
	// A v2 profile with genre badges set to "text" must keep them, which means
	// the genre flag on and the mode carried across.
	out := convert(t, `{"posterGenreBadge":"text"}`)
	poster := surfaceOf(t, out, "poster")
	if !poster.Genre {
		t.Error("the genre flag must be on when v2 had a genre badge mode")
	}
	if poster.GenreBadgeMode != "text" {
		t.Errorf("genre badge mode = %q, want text", poster.GenreBadgeMode)
	}
}

func TestV2GenreBadgeOffTurnsTheFlagOff(t *testing.T) {
	out := convert(t, `{"genreBadge":"off"}`)
	poster := surfaceOf(t, out, "poster")
	if poster.Genre {
		t.Error("an off genre badge must leave the genre flag off")
	}
	if poster.GenreBadgeMode != "" {
		t.Errorf("an off genre badge must carry no mode, got %q", poster.GenreBadgeMode)
	}
}

func TestV2ProviderAppearanceDecodesAccentAndIconScale(t *testing.T) {
	// v2 packed "source.accent.iconScale.…" per provider; the accent and scale
	// have a home in v3, the rest describes a badge v3 does not draw.
	out := convert(t, `{"providerAppearance":"trakt.7c3aed.118.86.74.logo.0.86,imdb.facc15.100"}`)
	poster := surfaceOf(t, out, "poster")
	if poster.RatingProviderOverrides["trakt"] != "#7c3aed" {
		t.Errorf("trakt accent = %q, want #7c3aed", poster.RatingProviderOverrides["trakt"])
	}
	if poster.RatingProviderIconScale["trakt"] != 118 {
		t.Errorf("trakt icon scale = %d, want 118", poster.RatingProviderIconScale["trakt"])
	}
	if poster.RatingProviderOverrides["imdb"] != "#facc15" {
		t.Errorf("imdb accent = %q, want #facc15", poster.RatingProviderOverrides["imdb"])
	}
}

func TestV2QualityBadgesSideBecomesAPosition(t *testing.T) {
	out := convert(t, `{"posterQualityBadgesSide":"left"}`)
	if got := surfaceOf(t, out, "poster").QualityBadgesPos; got != "bl" {
		t.Errorf("quality badges position = %q, want bl", got)
	}
}

func TestAnExplicitQualityPositionWinsOverTheSide(t *testing.T) {
	out := convert(t, `{"posterQualityBadgesSide":"left","posterQualityBadgesPosition":"tr"}`)
	if got := surfaceOf(t, out, "poster").QualityBadgesPos; got != "tr" {
		t.Errorf("quality badges position = %q, want the explicit tr", got)
	}
}
