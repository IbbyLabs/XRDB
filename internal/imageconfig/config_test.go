package imageconfig

import (
	"encoding/json"
	"testing"
)

func TestDefaultReturnsExpectedValues(t *testing.T) {
	d := Default()
	// The default tier is the one that fits Stremio's 100 KB poster limit.
	if d.Size != SizeSmall {
		t.Errorf("Size: got %q, want %q", d.Size, SizeSmall)
	}
	if d.OutputFormat != OutputAuto {
		t.Errorf("OutputFormat: got %q, want %q", d.OutputFormat, OutputAuto)
	}
	if d.ArtworkSource != ArtworkTMDB {
		t.Errorf("ArtworkSource: got %q, want %q", d.ArtworkSource, ArtworkTMDB)
	}
	if d.Language != "en" {
		t.Errorf("Language: got %q, want %q", d.Language, "en")
	}
	if d.RatingsLayout != LayoutBottom {
		t.Errorf("RatingsLayout: got %q, want %q", d.RatingsLayout, LayoutBottom)
	}
	if len(d.Ratings) == 0 {
		t.Error("expected default ratings to be non-empty")
	}
}

func TestParseEmptyReturnsDefault(t *testing.T) {
	got := Parse(nil)
	want := Default()
	if got.Size != want.Size || got.Language != want.Language {
		t.Errorf("Parse(nil) != Default(): got %+v", got)
	}
}

func TestParseOverridesFields(t *testing.T) {
	raw := json.RawMessage(`{
		"size": "large",
		"artworkSource": "fanart",
		"language": "JA",
		"textPreference": "clean",
		"ratings": ["rt", "imdb", "tmdb"],
		"ratingsLayout": "top",
		"ageRating": false
	}`)
	cfg := Parse(raw)
	if cfg.Size != SizeLarge {
		t.Errorf("Size: got %q, want large", cfg.Size)
	}
	if cfg.ArtworkSource != ArtworkFanart {
		t.Errorf("ArtworkSource: got %q, want fanart", cfg.ArtworkSource)
	}
	if cfg.Language != "ja" {
		t.Errorf("Language: got %q, want ja (lowercased)", cfg.Language)
	}
	if cfg.TextPreference != TextClean {
		t.Errorf("TextPreference: got %q, want clean", cfg.TextPreference)
	}
	if cfg.RatingsLayout != LayoutTop {
		t.Errorf("RatingsLayout: got %q, want top", cfg.RatingsLayout)
	}
	if cfg.AgeRating {
		t.Error("expected AgeRating=false")
	}
	if len(cfg.Ratings) != 3 {
		t.Errorf("expected 3 ratings, got %d", len(cfg.Ratings))
	}
}

func TestParseNormalizesAliases(t *testing.T) {
	cases := []struct {
		field string
		raw   string
		want  string
	}{
		{"size", `{"size":"uhd"}`, "4k"},
		{"size", `{"size":"verylarge"}`, "4k"},
		{"size", `{"size":"standard"}`, "normal"},
		{"artworkSource", `{"artworkSource":"imdb"}`, "cinemeta"},
		{"ratingsLayout", `{"ratingsLayout":"split-side"}`, "split-side"},
	}
	for _, tc := range cases {
		cfg := Parse(json.RawMessage(tc.raw))
		var got string
		switch tc.field {
		case "size":
			got = string(cfg.Size)
		case "artworkSource":
			got = string(cfg.ArtworkSource)
		case "ratingsLayout":
			got = string(cfg.RatingsLayout)
		}
		if got != tc.want {
			t.Errorf("field %s raw %s: got %q, want %q", tc.field, tc.raw, got, tc.want)
		}
	}
}

func TestParseInvalidFallsBackToDefault(t *testing.T) {
	raw := json.RawMessage(`{"size":"huge","artworkSource":"netflix","ratingsLayout":"diagonal"}`)
	cfg := Parse(raw)
	def := Default()
	if cfg.Size != def.Size {
		t.Errorf("invalid size should fall back to default, got %q", cfg.Size)
	}
	if cfg.ArtworkSource != def.ArtworkSource {
		t.Errorf("invalid artworkSource should fall back to default, got %q", cfg.ArtworkSource)
	}
	if cfg.RatingsLayout != def.RatingsLayout {
		t.Errorf("invalid ratingsLayout should fall back to default, got %q", cfg.RatingsLayout)
	}
}

func TestParseDeduplicatesRatings(t *testing.T) {
	raw := json.RawMessage(`{"ratings":["imdb","tmdb","imdb","  tmdb  "]}`)
	cfg := Parse(raw)
	if len(cfg.Ratings) != 2 {
		t.Errorf("expected 2 deduplicated ratings, got %d: %v", len(cfg.Ratings), cfg.Ratings)
	}
}

func TestParseSurfaceFlatConfigAppliesToEverySurface(t *testing.T) {
	// A legacy flat config (no "surfaces" key) must resolve identically for
	// every surface so profiles saved before per-surface settings keep working.
	raw := json.RawMessage(`{"size":"large","artworkSource":"fanart","language":"ja"}`)
	for _, surface := range Surfaces {
		cfg := ParseSurface(raw, surface)
		if cfg.Size != SizeLarge {
			t.Errorf("surface %q Size: got %q, want large", surface, cfg.Size)
		}
		if cfg.ArtworkSource != ArtworkFanart {
			t.Errorf("surface %q ArtworkSource: got %q, want fanart", surface, cfg.ArtworkSource)
		}
		if cfg.Language != "ja" {
			t.Errorf("surface %q Language: got %q, want ja", surface, cfg.Language)
		}
	}
}

func TestParseSurfaceResolvesEachSurfaceIndependently(t *testing.T) {
	raw := json.RawMessage(`{
		"v": 2,
		"surfaces": {
			"poster":   {"size":"4k","artworkSource":"tmdb","ratingsLayout":"bottom"},
			"backdrop": {"size":"normal","artworkSource":"fanart","ratingsLayout":"none"}
		}
	}`)

	poster := ParseSurface(raw, "poster")
	if poster.Size != Size4K {
		t.Errorf("poster Size: got %q, want 4k", poster.Size)
	}
	if poster.ArtworkSource != ArtworkTMDB {
		t.Errorf("poster ArtworkSource: got %q, want tmdb", poster.ArtworkSource)
	}
	if poster.RatingsLayout != LayoutBottom {
		t.Errorf("poster RatingsLayout: got %q, want bottom", poster.RatingsLayout)
	}

	backdrop := ParseSurface(raw, "backdrop")
	if backdrop.Size != SizeNormal {
		t.Errorf("backdrop Size: got %q, want normal", backdrop.Size)
	}
	if backdrop.ArtworkSource != ArtworkFanart {
		t.Errorf("backdrop ArtworkSource: got %q, want fanart", backdrop.ArtworkSource)
	}
	if backdrop.RatingsLayout != LayoutNone {
		t.Errorf("backdrop RatingsLayout: got %q, want none", backdrop.RatingsLayout)
	}
}

func TestParseSurfaceMissingSurfaceFallsBackToDefault(t *testing.T) {
	// Envelope present but the requested surface is absent → Default().
	raw := json.RawMessage(`{"surfaces":{"poster":{"size":"4k"}}}`)
	got := ParseSurface(raw, "logo")
	want := Default()
	if got.Size != want.Size || got.ArtworkSource != want.ArtworkSource {
		t.Errorf("missing surface should fall back to Default(), got %+v", got)
	}
}

func TestParseSurfaceEmptyReturnsDefault(t *testing.T) {
	got := ParseSurface(nil, "poster")
	want := Default()
	if got.Size != want.Size || got.Language != want.Language {
		t.Errorf("ParseSurface(nil) != Default(): got %+v", got)
	}
}

func TestIsSurface(t *testing.T) {
	for _, s := range Surfaces {
		if !IsSurface(s) {
			t.Errorf("IsSurface(%q) = false, want true", s)
		}
	}
	for _, bad := range []string{"", "movie", "Poster", "banner", "logo "} {
		if IsSurface(bad) {
			t.Errorf("IsSurface(%q) = true, want false", bad)
		}
	}
}

func TestCacheKeyStableForSameConfig(t *testing.T) {
	cfg := Default()
	k1 := CacheKey(cfg)
	k2 := CacheKey(cfg)
	if k1 != k2 {
		t.Error("CacheKey not stable for same config")
	}
}

func TestCacheKeyIndependentOfRatingsOrder(t *testing.T) {
	cfg1 := Default()
	cfg1.Ratings = []string{"tmdb", "imdb", "rt"}
	cfg2 := Default()
	cfg2.Ratings = []string{"rt", "tmdb", "imdb"}
	if CacheKey(cfg1) != CacheKey(cfg2) {
		t.Error("CacheKey should be independent of ratings order (sorted before hashing)")
	}
}

func TestCacheKeyDiffersForDifferentConfigs(t *testing.T) {
	c1 := Default()
	c2 := Default()
	c2.Language = "ja"
	if CacheKey(c1) == CacheKey(c2) {
		t.Error("expected different cache keys for different language")
	}
}

func TestCanonicalJSONRoundTrip(t *testing.T) {
	cfg := Default()
	cfg.Language = "fr"
	cfg.Ratings = []string{"tmdb", "rt", "letterboxd"}

	raw, err := CanonicalJSON(cfg)
	if err != nil {
		t.Fatalf("CanonicalJSON: %v", err)
	}
	restored := Parse(raw)
	if restored.Language != "fr" {
		t.Errorf("round-trip Language: got %q, want fr", restored.Language)
	}
	if len(restored.Ratings) != 3 {
		t.Errorf("round-trip Ratings: got %v", restored.Ratings)
	}
}

func TestParseAcceptsEveryRatingValueModeSpelling(t *testing.T) {
	// v2 wrote the hyphenated and long-form spellings, so a migrated profile can
	// carry any of these and must land on the same canonical mode.
	cases := map[string]string{
		"native":             "native",
		"normalized":         "normalized",
		"Normalized":         "normalized",
		" normalizedclean ":  "normalizedclean",
		"normalized-clean":   "normalizedclean",
		"normalized_clean":   "normalizedclean",
		"normalizedcleanten": "normalizedclean",
		"normalized100":      "normalized100",
		"normalized-100":     "normalized100",
		"normalizedhundred":  "normalized100",
	}
	for input, want := range cases {
		data, err := json.Marshal(map[string]string{"ratingValueMode": input})
		if err != nil {
			t.Fatalf("marshal %q: %v", input, err)
		}
		if got := Parse(data).RatingValueMode; got != want {
			t.Errorf("ratingValueMode %q parsed as %q, want %q", input, got, want)
		}
	}
}

func TestParseIgnoresAnUnknownRatingValueMode(t *testing.T) {
	data := json.RawMessage(`{"ratingValueMode":"out-of-five"}`)
	if got := Parse(data).RatingValueMode; got != "" {
		t.Errorf("unknown mode parsed as %q, want the native default", got)
	}
}

func TestRatingValueModeIsAModeledKey(t *testing.T) {
	if !IsModeledKey("ratingValueMode") {
		t.Error("ratingValueMode must be modeled so a migrated v2 profile converts it")
	}
}

func TestParseReadsTheSplitAggregateColours(t *testing.T) {
	data := json.RawMessage(`{
		"aggregateCriticsAccentColor":"#22c55e",
		"aggregateAudienceAccentColor":"#38bdf8",
		"aggregateCriticsValueColor":"#ffffff",
		"aggregateAudienceValueColor":"#000000",
		"aggregateAccentBarVisible":false,
		"aggregateAccentBarOffset":7
	}`)
	cfg := Parse(data)
	if cfg.AggregateCriticsAccentColor != "#22c55e" || cfg.AggregateAudienceAccentColor != "#38bdf8" {
		t.Errorf("accent colours: %+v", cfg.AggregateConfig)
	}
	if cfg.AggregateCriticsValueColor != "#ffffff" || cfg.AggregateAudienceValueColor != "#000000" {
		t.Errorf("value colours: %+v", cfg.AggregateConfig)
	}
	if cfg.AggregateAccentBarVisible == nil || *cfg.AggregateAccentBarVisible {
		t.Error("the accent bar must read as hidden")
	}
	if cfg.AggregateAccentBarOffset != 7 {
		t.Errorf("accent bar offset = %d, want 7", cfg.AggregateAccentBarOffset)
	}
}

func TestParseRejectsAColourThatIsNotOne(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"aggregateCriticsAccentColor":"green"}`))
	if cfg.AggregateCriticsAccentColor != "" {
		t.Errorf("got %q, want the field left unset", cfg.AggregateCriticsAccentColor)
	}
}

func TestParseDynamicStopsOrdersAndValidates(t *testing.T) {
	stops := ParseDynamicStops("75:#84cc16,0:#7f1d1d,40:#dc2626")
	if len(stops) != 3 {
		t.Fatalf("got %d stops, want 3", len(stops))
	}
	if stops[0].Score != 0 || stops[2].Score != 75 {
		t.Errorf("stops are not ordered by score: %+v", stops)
	}
	if ParseDynamicStops("0:notacolour,over:#ffffff") != nil {
		t.Error("a list with no usable stop must parse as nothing")
	}
	if ParseDynamicStops("200:#ffffff") != nil {
		t.Error("a score outside 0-100 is not a usable stop")
	}
}

func TestAStopListThatParsesToNothingIsNotStored(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"aggregateDynamicStops":"nonsense"}`))
	if cfg.AggregateDynamicStops != "" {
		t.Errorf("got %q, want the field left unset", cfg.AggregateDynamicStops)
	}
}

func TestParseReadsTheReleaseStatusStyle(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"releaseStatusBadgeStyle":"tile","releaseStatusTileColor":"#38bdf8"}`))
	if cfg.ReleaseStatusBadgeStyle != "tile" {
		t.Errorf("style = %q, want tile", cfg.ReleaseStatusBadgeStyle)
	}
	if cfg.ReleaseStatusTileColor != "#38bdf8" {
		t.Errorf("tile colour = %q", cfg.ReleaseStatusTileColor)
	}
	if got := Parse(json.RawMessage(`{"releaseStatusBadgeStyle":"neon"}`)).ReleaseStatusBadgeStyle; got != "" {
		t.Errorf("unknown style parsed as %q, want the default", got)
	}
}

func TestParseReadsTheBadgeGeometry(t *testing.T) {
	data := json.RawMessage(`{
		"ratingXOffsetPillGlass":10,"ratingYOffsetPillGlass":-6,
		"ratingXOffsetSquare":4,"ratingYOffsetSquare":8,
		"posterEdgeOffset":30,"bottomRatingsRow":true
	}`)
	cfg := Parse(data)
	if cfg.RatingOffsetXPillGlass != 10 || cfg.RatingOffsetYPillGlass != -6 {
		t.Errorf("pill/glass offsets: %+v", cfg.RatingBadgeConfig)
	}
	if cfg.RatingOffsetXSquare != 4 || cfg.RatingOffsetYSquare != 8 {
		t.Errorf("square offsets: %+v", cfg.RatingBadgeConfig)
	}
	if cfg.PosterEdgeOffset != 30 {
		t.Errorf("edge offset = %d, want 30", cfg.PosterEdgeOffset)
	}
	if !cfg.BottomRatingsRow {
		t.Error("the bottom ratings row must read as on")
	}
}

func TestParseClampsTheEdgeOffset(t *testing.T) {
	if got := Parse(json.RawMessage(`{"posterEdgeOffset":500}`)).PosterEdgeOffset; got != 80 {
		t.Errorf("edge offset = %d, want it clamped to 80", got)
	}
	if got := Parse(json.RawMessage(`{"posterEdgeOffset":-10}`)).PosterEdgeOffset; got != 0 {
		t.Errorf("edge offset = %d, want it clamped to 0", got)
	}
}

func TestParseReadsTheTrendingTagStyle(t *testing.T) {
	if got := Parse(json.RawMessage(`{"trendingTagStyle":"square"}`)).TrendingTagStyle; got != "square" {
		t.Errorf("trending tag style = %q, want square", got)
	}
	// v2's community-badge style has no home here, so it is ignored rather than
	// applied as something wrong.
	if got := Parse(json.RawMessage(`{"trendingTagStyle":"community-badge"}`)).TrendingTagStyle; got != "" {
		t.Errorf("unsupported style parsed as %q, want the default", got)
	}
}

func TestParseReadsPerProviderIconScale(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"ratingProviderIconScale":{"IMDb":130,"trakt":0,"rt":999}}`))
	if cfg.RatingProviderIconScale["imdb"] != 130 {
		t.Errorf("imdb scale = %d, want 130 (and the key lowercased)", cfg.RatingProviderIconScale["imdb"])
	}
	if _, ok := cfg.RatingProviderIconScale["trakt"]; ok {
		t.Error("a zero scale carries no meaning and must be dropped")
	}
	if cfg.RatingProviderIconScale["rt"] != 150 {
		t.Errorf("rt scale = %d, want it clamped to 150", cfg.RatingProviderIconScale["rt"])
	}
}
