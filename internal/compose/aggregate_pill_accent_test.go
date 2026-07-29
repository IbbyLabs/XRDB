package compose

import (
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

func customAccentConfig() imageconfig.Config {
	cfg := dualConfig()
	cfg.AggregateAccentMode = "custom"
	cfg.AggregateCriticsAccentColor = "#ff0000"
	cfg.AggregateAudienceAccentColor = "#0000ff"
	return cfg
}

// countNear returns how many pixels sit close to want, so an anti-aliased
// outline still registers.
func countNear(img *image.NRGBA, want color.NRGBA) int {
	near := func(a, b uint8) bool {
		if a > b {
			return a-b < 40
		}
		return b-a < 40
	}
	n := 0
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			p := img.NRGBAAt(x, y)
			if p.A > 100 && near(p.R, want.R) && near(p.G, want.G) && near(p.B, want.B) {
				n++
			}
		}
	}
	return n
}

// A pill with no label has no accent rail, so a configured accent had nowhere
// to land and the pickers looked inert. It outlines the capsule instead.
func TestAConfiguredAccentOutlinesALabellessPill(t *testing.T) {
	red := color.NRGBA{R: 255, A: 255}
	blue := color.NRGBA{B: 255, A: 255}

	plain := renderDual(dualConfig(), false)
	if got := countNear(plain, red); got != 0 {
		t.Fatalf("the default pill already carries the accent colour (%d px)", got)
	}

	tinted := renderDual(customAccentConfig(), false)
	if got := countNear(tinted, red); got < 50 {
		t.Errorf("critics accent did not reach the outline, %d red px", got)
	}
	if got := countNear(tinted, blue); got < 50 {
		t.Errorf("audience accent did not reach the outline, %d blue px", got)
	}
}

// Nothing moves for the great majority who never set an accent: the built-in
// per-role colours stay off the outline.
func TestTheBuiltInAccentLeavesTheOutlineAlone(t *testing.T) {
	style := aggregatePillStyle(dualConfig(), "critics", nil, false, 8.6,
		color.NRGBA{R: 39, G: 174, B: 96, A: 255})
	if style.accentSet {
		t.Error("an unconfigured accent was marked as set, which would colour the outline")
	}

	custom := aggregatePillStyle(customAccentConfig(), "critics", nil, false, 8.6, color.NRGBA{})
	if !custom.accentSet {
		t.Error("a configured accent was not marked as set")
	}
}

// Fill by score already routes the accent into the body, so the outline must
// not double up on it.
func TestFillByScoreKeepsTheAccentInTheBody(t *testing.T) {
	cfg := customAccentConfig()
	cfg.AggregateFillByScore = true
	filled := renderDual(cfg, false)
	if !imagesDiffer(filled, renderDual(customAccentConfig(), false)) {
		t.Error("fill by score rendered the same as the outline treatment")
	}
}

// Turning the accent rail off is how the config asks for a plain dark capsule,
// so it drops the coloured outline too.
func TestHidingTheAccentRailDropsTheColouredOutline(t *testing.T) {
	off := false
	cfg := customAccentConfig()
	cfg.AggregateAccentBarVisible = &off
	if got := countNear(renderDual(cfg, false), color.NRGBA{R: 255, A: 255}); got != 0 {
		t.Errorf("the accent still outlined the pill with the rail hidden, %d red px", got)
	}
}

// A labelled pill keeps filling its rail, so the labelled dual mode is
// untouched by any of this.
func TestALabelledPillStillFillsItsRail(t *testing.T) {
	labelled := renderDual(customAccentConfig(), true)
	if got := countNear(labelled, color.NRGBA{R: 255, A: 255}); got < 50 {
		t.Errorf("critics accent did not reach the label rail, %d red px", got)
	}
}
