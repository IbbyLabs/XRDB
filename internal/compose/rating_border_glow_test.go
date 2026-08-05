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
	drawBadgesInPlace(img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, cfg, titleFacts{})
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
		drawBadgesInPlace(img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, cfg, titleFacts{})
		return img
	}
	if !identical(draw(false), draw(true)) {
		t.Error("the border glow changed a badge that draws no border")
	}
}
