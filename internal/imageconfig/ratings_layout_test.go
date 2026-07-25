package imageconfig

import (
	"encoding/json"
	"testing"
)

// A v2 config spells the split-side layout "left-right" and has a "top-bottom"
// layout of its own. Both used to normalise away to the default, which moved a
// migrated profile's ratings without reporting anything.
func TestParseAcceptsLegacyRatingsLayoutSpellings(t *testing.T) {
	cases := []struct {
		in   string
		want RatingsLayout
	}{
		{"left-right", LayoutSplitSide},
		{"leftright", LayoutSplitSide},
		{"left_right", LayoutSplitSide},
		{"split-side", LayoutSplitSide},
		{"top-bottom", LayoutTopBottom},
		{"topbottom", LayoutTopBottom},
		{"top_bottom", LayoutTopBottom},
		{"left", LayoutLeft},
		{"right", LayoutRight},
		{"top", LayoutTop},
		{"bottom", LayoutBottom},
		{"none", LayoutNone},
		{"LEFT-RIGHT", LayoutSplitSide},
		// v2 gave the backdrop and thumbnail their own layout names.
		{"center", LayoutBottom},
		{"centre", LayoutBottom},
		{"right-vertical", LayoutRight},
		{"right vertical", LayoutRight},
		{"left-vertical", LayoutLeft},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			cfg := Parse(json.RawMessage(`{"ratingsLayout":"` + tc.in + `"}`))
			if cfg.RatingsLayout != tc.want {
				t.Errorf("ratingsLayout %q parsed to %q, want %q", tc.in, cfg.RatingsLayout, tc.want)
			}
		})
	}
}

// v2 wrote the same six placements three ways. An unrecognised token falls back
// to the default, which moved every badge in a migrated profile.
func TestSixPosAcceptsLegacySpellings(t *testing.T) {
	cases := map[string]string{
		"top-left": "tl", "left-top": "tl", "topLeft": "tl", "tl": "tl",
		"top-right": "tr", "right-top": "tr", "topRight": "tr",
		"top-center": "tc", "topCenter": "tc", "top-centre": "tc",
		"bottom-left": "bl", "left-bottom": "bl", "bottomLeft": "bl",
		"bottom-right": "br", "right-bottom": "br", "bottomRight": "br",
		"bottom-center": "bc", "bottomCenter": "bc", "bottom_center": "bc",
		"TOP-LEFT": "tl", "  top-left  ": "tl",
	}
	for in, want := range cases {
		if got := sixPos(in); got != want {
			t.Errorf("sixPos(%q) = %q, want %q", in, got, want)
		}
	}
}

// Anything that is not a placement must still be rejected, so a stray value
// cannot silently move a badge somewhere the user never asked for.
func TestSixPosRejectsUnknownValues(t *testing.T) {
	for _, in := range []string{"", "middle", "grouped", "inherit", "centre", "diagonal", "top", "bottom", "left", "right"} {
		if got := sixPos(in); got != "" {
			t.Errorf("sixPos(%q) = %q, want \"\"", in, got)
		}
	}
}

// Placement reaches the config the renderer reads, not just the validator.
func TestParseAcceptsLegacyBadgePositions(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"genrePos":"topCenter","ageRatingPos":"left-top","qualityBadgesPos":"bottom-right"}`))
	if cfg.GenrePos != "tc" {
		t.Errorf("genrePos = %q, want tc", cfg.GenrePos)
	}
	if cfg.AgeRatingPos != "tl" {
		t.Errorf("ageRatingPos = %q, want tl", cfg.AgeRatingPos)
	}
	if cfg.QualityBadgesPos != "br" {
		t.Errorf("qualityBadgesPos = %q, want br", cfg.QualityBadgesPos)
	}
}

// Every layout must key differently, or two profiles that look different share
// one cached image.
func TestRatingsLayoutsProduceDistinctCacheKeys(t *testing.T) {
	layouts := []RatingsLayout{
		LayoutTop, LayoutBottom, LayoutLeft, LayoutRight,
		LayoutSplitSide, LayoutTopBottom, LayoutNone,
	}
	seen := make(map[string]RatingsLayout, len(layouts))
	for _, l := range layouts {
		cfg := Default()
		cfg.RatingsLayout = l
		key := CacheKey(cfg)
		if prev, dup := seen[key]; dup {
			t.Errorf("layouts %q and %q share cache key %s", prev, l, key)
		}
		seen[key] = l
	}
}

// v2 offers two rating badge looks v3 had no token for: "No Background" and
// "Tile Dark". Without them a migrated profile silently reverts to the pill.
func TestParseAcceptsLegacyBadgeStyles(t *testing.T) {
	cases := map[string]BadgeStyle{
		"plain": BadgePlain, "no-background": BadgePlain, "none": BadgePlain,
		"tile": BadgeTile, "TILE": BadgeTile,
		"glass": BadgeGlass, "square": BadgeSquare, "pill": BadgePill,
	}
	for in, want := range cases {
		cfg := Parse(json.RawMessage(`{"badgeStyle":"` + in + `"}`))
		if cfg.BadgeStyle != want {
			t.Errorf("badgeStyle %q parsed to %q, want %q", in, cfg.BadgeStyle, want)
		}
	}
}

// Each style must key differently, or two profiles that look different share a
// cached image.
func TestBadgeStylesProduceDistinctCacheKeys(t *testing.T) {
	seen := map[string]BadgeStyle{}
	for _, s := range []BadgeStyle{BadgePill, BadgeSquare, BadgeGlass, BadgePlain, BadgeTile} {
		cfg := Default()
		cfg.BadgeStyle = s
		key := CacheKey(cfg)
		if prev, dup := seen[key]; dup {
			t.Errorf("styles %q and %q share cache key", prev, s)
		}
		seen[key] = s
	}
}

// v2's "Compact Ring" is one ring and no badge strip. v3 draws the ring as its
// own overlay, so the preset has to set both halves or nothing ring-like shows.
func TestParseMapsLegacyRingPresentation(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"ratingPresentation":"ring"}`))
	if !cfg.RatingRing {
		t.Error("ratingPresentation \"ring\" did not turn the ring on")
	}
	if cfg.RatingPresentation != "none" {
		t.Errorf("ratingPresentation = %q, want none so the badge strip is not also drawn", cfg.RatingPresentation)
	}
	// The presentations v3 already knew must be untouched.
	for _, p := range []string{"standard", "minimal", "average", "dual", "dual-minimal", "editorial", "scorebar", "none"} {
		got := Parse(json.RawMessage(`{"ratingPresentation":"` + p + `"}`))
		if got.RatingPresentation != p {
			t.Errorf("ratingPresentation %q parsed to %q", p, got.RatingPresentation)
		}
		if got.RatingRing {
			t.Errorf("ratingPresentation %q turned the ring on", p)
		}
	}
}

// v2 states the quality-badge placement as a side, not a corner, because the
// badges are always top-anchored.
func TestParseMapsLegacyQualityBadgePosition(t *testing.T) {
	cases := map[string]string{"left": "tl", "right": "tr", "tr": "tr", "bl": "bl", "bottom-right": "br"}
	for in, want := range cases {
		cfg := Parse(json.RawMessage(`{"qualityBadgesPos":"` + in + `"}`))
		if cfg.QualityBadgesPos != want {
			t.Errorf("qualityBadgesPos %q parsed to %q, want %q", in, cfg.QualityBadgesPos, want)
		}
	}
	// "auto" means "wherever the renderer puts them", so it keeps the default.
	def := Default().QualityBadgesPos
	if got := Parse(json.RawMessage(`{"qualityBadgesPos":"auto"}`)).QualityBadgesPos; got != def {
		t.Errorf("qualityBadgesPos auto = %q, want the default %q", got, def)
	}
}

// v2 writes the score-bar thresholds on a 0-100 scale; the renderer compares
// against 0-10, so an out-of-range value silently kept the default.
func TestParseRescalesLegacyScorebarThresholds(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"scorebarHighThreshold":100,"scorebarLowThreshold":40}`))
	if cfg.ScorebarHighThreshold != 10 {
		t.Errorf("scorebarHighThreshold 100 -> %v, want 10", cfg.ScorebarHighThreshold)
	}
	if cfg.ScorebarLowThreshold != 4 {
		t.Errorf("scorebarLowThreshold 40 -> %v, want 4", cfg.ScorebarLowThreshold)
	}
	// A value already on the 0-10 scale must pass through untouched.
	ten := Parse(json.RawMessage(`{"scorebarHighThreshold":7.5}`))
	if ten.ScorebarHighThreshold != 7.5 {
		t.Errorf("scorebarHighThreshold 7.5 -> %v, want 7.5", ten.ScorebarHighThreshold)
	}
}
