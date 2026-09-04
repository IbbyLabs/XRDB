package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// The FR asks for the tile border itself to bloom, tinted per rating site. The
// glow setting that already existed traces glyphs, which is a different thing
// wearing the same word (FR-156).
func tileBorderBadge(glow bool) *image.NRGBA {
	cfg := imageconfig.Default()
	cfg.BadgeStyle = imageconfig.BadgeTile
	cfg.RatingBadgeBorderColor = "#22d3ee"
	cfg.RatingBadgeBorderWidth = 2
	cfg.RatingBadgeBorderGlow = glow

	img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
	drawBadgesInPlace("", img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, cfg, titleFacts{})
	return img
}

func diffMagnitude(a, b *image.NRGBA) (maxDiff, changed int) {
	for i := range a.Pix {
		d := int(a.Pix[i]) - int(b.Pix[i])
		if d < 0 {
			d = -d
		}
		if d > maxDiff {
			maxDiff = d
		}
		if d > 12 {
			changed++
		}
	}
	return maxDiff, changed
}

// Asserted by magnitude. "Not identical" is satisfied by one changed subpixel
// while leaving the setting invisible, which is the state this item exists to end.
func TestTheBorderGlowBloomsTheRatingBadgeOutline(t *testing.T) {
	maxDiff, changed := diffMagnitude(tileBorderBadge(false), tileBorderBadge(true))
	if maxDiff < 40 || changed < 100 {
		t.Errorf("the border glow barely reaches the badge: max channel diff %d over %d subpixels",
			maxDiff, changed)
	}
}

// The bloom reaches beyond the badge's own edge — that is what makes it a halo
// rather than a thicker line.
func TestTheBloomExtendsBeyondTheBorder(t *testing.T) {
	hard, glow := tileBorderBadge(false), tileBorderBadge(true)
	outside := 0
	b := hard.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if hard.NRGBAAt(x, y).A == 0 && glow.NRGBAAt(x, y).A > 0 {
				outside++
			}
		}
	}
	if outside < 50 {
		t.Errorf("the bloom painted only %d pixels the hard border left untouched", outside)
	}
}

// A badge with no border must be untouched, or the setting leaks into configs
// that never asked for it.
func TestTheBorderGlowDoesNothingWithoutABorder(t *testing.T) {
	draw := func(glow bool) *image.NRGBA {
		cfg := imageconfig.Default()
		cfg.BadgeStyle = imageconfig.BadgePill
		cfg.RatingBadgeBorderWidth = -1
		cfg.RatingBadgeBorderGlow = glow
		img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
		drawBadgesInPlace("", img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, cfg, titleFacts{})
		return img
	}
	if !identical(draw(false), draw(true)) {
		t.Error("the border glow changed a badge that draws no border")
	}
}

// tileBorderAt renders the bloom at a given strength dial position.
func tileBorderAt(strength int) *image.NRGBA {
	cfg := imageconfig.Default()
	cfg.BadgeStyle = imageconfig.BadgeTile
	cfg.RatingBadgeBorderColor = "#22d3ee"
	cfg.RatingBadgeBorderWidth = 2
	cfg.RatingBadgeBorderGlow = true
	cfg.RatingBadgeBorderGlowStrength = strength

	img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
	drawBadgesInPlace("", img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, cfg, titleFacts{})
	return img
}

// inkedExtent measures how far the render reaches, as the painted bounding box.
// Reach is what separates a strength dial from one that only changes opacity.
func inkedExtent(img *image.NRGBA) (w, h int) {
	minX, minY, maxX, maxY := 1<<30, 1<<30, -1, -1
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y).A == 0 {
				continue
			}
			if x < minX {
				minX = x
			}
			if y < minY {
				minY = y
			}
			if x > maxX {
				maxX = x
			}
			if y > maxY {
				maxY = y
			}
		}
	}
	if maxX < 0 {
		return 0, 0
	}
	return maxX - minX, maxY - minY
}

func TestTheBloomStrengthChangesTheRender(t *testing.T) {
	weak, strong := tileBorderAt(10), tileBorderAt(100)
	maxDiff, changed := diffMagnitude(weak, strong)
	if maxDiff < 40 || changed < 100 {
		t.Errorf("two strengths barely differ: max channel diff %d over %d subpixels", maxDiff, changed)
	}
}

// The property that separates a real strength dial from an opacity slider.
func TestAStrongerBloomReachesFurther(t *testing.T) {
	ww, wh := inkedExtent(tileBorderAt(10))
	sw, sh := inkedExtent(tileBorderAt(100))
	if sw <= ww || sh <= wh {
		t.Errorf("a stronger bloom did not reach further: %dx%d at 10%%, %dx%d at 100%%", ww, wh, sw, sh)
	}
}

// Zero means the built-in default here, as it does for every other 0-100 key,
// rather than meaning off.
func TestAZeroStrengthIsTheDefaultNotOff(t *testing.T) {
	if !identical(tileBorderAt(0), tileBorderAt(strokeBloomDefaultStrength)) {
		t.Error("an unset strength does not render as the default dial position")
	}
	if identical(tileBorderAt(0), tileBorderAt(0)) != true {
		t.Fatal("the draw is not deterministic")
	}
	// The control: zero is not off, so it must differ from no bloom at all.
	if identical(tileBorderAt(0), tileBorderBadge(false)) {
		t.Error("a zero strength turned the bloom off instead of using the default")
	}
}

func TestBloomForResolvesTheDial(t *testing.T) {
	rings, alpha := bloomFor(0)
	if rings != strokeBloomRings || alpha != strokeBloomAlpha {
		t.Errorf("zero gave %d rings at %v, want the defaults", rings, alpha)
	}
	if r, a := bloomFor(strokeBloomDefaultStrength); r != strokeBloomRings || a != strokeBloomAlpha {
		t.Errorf("the default dial position gave %d rings at %v", r, a)
	}
	// Both move together, which is the whole reason it is not an alpha slider.
	weakR, weakA := bloomFor(10)
	strongR, strongA := bloomFor(100)
	if strongR <= weakR || strongA <= weakA {
		t.Errorf("reach and intensity do not both grow: %d/%v against %d/%v", weakR, weakA, strongR, strongA)
	}
	if r, _ := bloomFor(1); r < 1 {
		t.Error("the lowest strength drew no ring at all")
	}
}
