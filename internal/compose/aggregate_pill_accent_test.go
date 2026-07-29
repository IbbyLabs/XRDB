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

// The outline is a stroke of the capsule, so it must reach the far left and
// right of the pill. Walking only the bounding rectangle's straight edges left
// the curved ends unpainted and bled two stubs out at mid-height instead.
func TestTheOutlineFollowsTheCapsuleRatherThanItsBoundingBox(t *testing.T) {
	img := renderDual(customAccentConfig(), false)

	isAccent := func(x, y int) bool {
		p := img.NRGBAAt(x, y)
		return p.A > 100 && p.R > 200 && p.G < 90 && p.B < 90
	}

	minX, maxX, minY, maxY := img.Bounds().Max.X, -1, img.Bounds().Max.Y, -1
	for y := img.Bounds().Min.Y; y < img.Bounds().Max.Y; y++ {
		for x := img.Bounds().Min.X; x < img.Bounds().Max.X; x++ {
			if !isAccent(x, y) {
				continue
			}
			minX, maxX = min(minX, x), max(maxX, x)
			minY, maxY = min(minY, y), max(maxY, y)
		}
	}
	if maxX < 0 {
		t.Fatal("no outline was drawn at all")
	}

	// The curved end is where the two approaches diverge. Tracing the capsule
	// paints the whole arc; walking the bounding box painted only the few rows
	// of the straight left edge that survived the corner clip.
	end := 0
	for y := minY; y <= maxY; y++ {
		for x := minX; x <= minX+(maxX-minX)/8; x++ {
			if isAccent(x, y) {
				end++
			}
		}
	}
	if end < 40 {
		t.Errorf("only %d px of the pill's curved end are painted, so it is bleeding stubs rather than tracing the capsule", end)
	}
}

// The accent shape picks between tracing the capsule and a bar along the top.
func TestTheAccentShapeChoosesBetweenOutlineAndStrip(t *testing.T) {
	strip := customAccentConfig()
	strip.AggregateAccentShape = "strip"
	if !imagesDiffer(renderDual(customAccentConfig(), false), renderDual(strip, false)) {
		t.Error("the top strip rendered the same as the outline")
	}
	if got := countNear(renderDual(strip, false), color.NRGBA{R: 255, A: 255}); got < 20 {
		t.Errorf("the top strip did not carry the accent colour, %d red px", got)
	}
}
