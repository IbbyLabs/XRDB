package compose

import (
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

func boolPtr(v bool) *bool { return &v }

var pillFallback = color.NRGBA{R: 1, G: 2, B: 3, A: 255}

func TestCriticsAndAudienceKeepTheirOwnColours(t *testing.T) {
	cfg := imageconfig.Config{}
	cfg.AggregateAccentMode = "custom"
	cfg.AggregateAccentColor = "#111111"
	cfg.AggregateCriticsAccentColor = "#22c55e"
	cfg.AggregateAudienceAccentColor = "#38bdf8"
	cfg.AggregateCriticsValueColor = "#fefefe"
	cfg.AggregateAudienceValueColor = "#010101"

	critics := aggregatePillStyle(cfg, "critics", nil, false, 7, pillFallback)
	if critics.accent != (color.NRGBA{R: 0x22, G: 0xc5, B: 0x5e, A: 255}) {
		t.Errorf("critics accent = %v", critics.accent)
	}
	if critics.value != (color.NRGBA{R: 0xfe, G: 0xfe, B: 0xfe, A: 255}) {
		t.Errorf("critics value colour = %v", critics.value)
	}

	audience := aggregatePillStyle(cfg, "audience", nil, false, 7, pillFallback)
	if audience.accent != (color.NRGBA{R: 0x38, G: 0xbd, B: 0xf8, A: 255}) {
		t.Errorf("audience accent = %v", audience.accent)
	}
	if audience.value != (color.NRGBA{R: 1, G: 1, B: 1, A: 255}) {
		t.Errorf("audience value colour = %v", audience.value)
	}
}

func TestAPillFallsBackToTheSharedAggregateColours(t *testing.T) {
	cfg := imageconfig.Config{}
	cfg.AggregateAccentMode = "custom"
	cfg.AggregateAccentColor = "#111111"
	cfg.AggregateValueColor = "#222222"

	got := aggregatePillStyle(cfg, "critics", nil, false, 7, pillFallback)
	if got.accent != (color.NRGBA{R: 0x11, G: 0x11, B: 0x11, A: 255}) {
		t.Errorf("accent = %v, want the shared aggregate accent", got.accent)
	}
	if got.value != (color.NRGBA{R: 0x22, G: 0x22, B: 0x22, A: 255}) {
		t.Errorf("value colour = %v, want the shared value colour", got.value)
	}
}

func TestAPillWithNothingConfiguredKeepsItsBuiltInAccent(t *testing.T) {
	got := aggregatePillStyle(imageconfig.Config{}, "critics", nil, false, 7, pillFallback)
	if got.accent != pillFallback {
		t.Errorf("accent = %v, want the built-in %v", got.accent, pillFallback)
	}
	if !got.accentShown {
		t.Error("the accent rail shows unless the config hides it")
	}
}

func TestHidingTheAccentRailLeavesAPlainCapsule(t *testing.T) {
	cfg := imageconfig.Config{}
	cfg.AggregateAccentBarVisible = boolPtr(false)
	cfg.AggregateAccentBarOffset = 6

	got := aggregatePillStyle(cfg, "overall", nil, false, 7, pillFallback)
	if got.accentShown {
		t.Error("the accent rail must stay hidden when the config turns it off")
	}
	if got.accentOffset != 6 {
		t.Errorf("accent offset = %d, want 6", got.accentOffset)
	}
}

func TestTheDynamicAccentFollowsTheConfiguredStops(t *testing.T) {
	const stops = "0:#000000,100:#ffffff"
	if got := dynamicAccentHex(0, stops); got != "#000000" {
		t.Errorf("score 0 = %q, want the first stop", got)
	}
	if got := dynamicAccentHex(10, stops); got != "#ffffff" {
		t.Errorf("score 10 = %q, want the last stop", got)
	}
	// Half way between the stops blends the two colours.
	if got := dynamicAccentHex(5, stops); got != "#7f7f7f" && got != "#808080" {
		t.Errorf("score 5 = %q, want a blend of the two stops", got)
	}
}

func TestAnUnusableStopListLeavesTheFallbackAlone(t *testing.T) {
	if got := dynamicAccentHex(5, "not-a-ramp"); got != "" {
		t.Errorf("malformed stops = %q, want an empty result so the caller falls back", got)
	}
	if got := dynamicAccentHex(5, ""); got != "" {
		t.Errorf("empty stops = %q, want an empty result", got)
	}
}
