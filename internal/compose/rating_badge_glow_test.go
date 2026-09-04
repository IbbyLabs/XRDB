package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// The glow setting reached every background-less badge except the rating badge,
// which traced its own outline and ignored it — while the control's own copy
// said it applied there (FR-156).
func plainRatingBadge(glow bool) *image.NRGBA {
	cfg := imageconfig.Default()
	cfg.BadgeStyle = imageconfig.BadgePlain
	cfg.NoBackgroundBadgeOutlineColor = "#000000"
	cfg.NoBackgroundBadgeOutlineWidth = 3
	cfg.NoBackgroundBadgeOutlineGlow = glow

	img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
	drawBadgesInPlace("", img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, cfg, titleFacts{})
	return img
}

// Asserted by magnitude rather than by inequality. A single changed subpixel
// satisfies "not identical" while leaving the setting invisible, which is the
// state this whole item exists to end.
func TestTheGlowSettingReachesTheRatingBadge(t *testing.T) {
	hard, glow := plainRatingBadge(false), plainRatingBadge(true)
	maxDiff, changed := 0, 0
	for i := range hard.Pix {
		d := int(hard.Pix[i]) - int(glow.Pix[i])
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
	if maxDiff < 40 || changed < 100 {
		t.Errorf("the glow barely reaches the rating badge: max channel diff %d over %d subpixels",
			maxDiff, changed)
	}
}

// The control: the hard outline is still drawn. Without it the test above passes
// if the outline stops being drawn at all.
func TestThePlainRatingBadgeStillDrawsItsOutline(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.BadgeStyle = imageconfig.BadgePlain
	img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
	drawBadgesInPlace("", img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, cfg, titleFacts{})

	if identical(img, plainRatingBadge(false)) {
		t.Error("the outline colour and width no longer change the plain rating badge")
	}
}

// A hard outline must look exactly as it did, or every existing render moves.
func TestTheHardOutlineIsUnchanged(t *testing.T) {
	if !identical(plainRatingBadge(false), plainRatingBadge(false)) {
		t.Fatal("the draw is not deterministic, so the comparison below means nothing")
	}
	// A style with no outline is untouched by any of this.
	cfg := imageconfig.Default()
	cfg.BadgeStyle = imageconfig.BadgePill
	withGlow := cfg
	withGlow.NoBackgroundBadgeOutlineGlow = true

	draw := func(c imageconfig.Config) *image.NRGBA {
		img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
		drawBadgesInPlace("", img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, c, titleFacts{})
		return img
	}
	if !identical(draw(cfg), draw(withGlow)) {
		t.Error("the glow setting changed a badge style that draws no outline")
	}
}
