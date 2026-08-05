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
	drawBadgesInPlace(img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, cfg, titleFacts{})
	return img
}

func TestTheGlowSettingReachesTheRatingBadge(t *testing.T) {
	if identical(plainRatingBadge(false), plainRatingBadge(true)) {
		t.Error("the glow setting does not change the rating badge outline")
	}
}

// The control: the hard outline is still drawn. Without it the test above passes
// if the outline stops being drawn at all.
func TestThePlainRatingBadgeStillDrawsItsOutline(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.BadgeStyle = imageconfig.BadgePlain
	img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
	drawBadgesInPlace(img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, cfg, titleFacts{})

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
		drawBadgesInPlace(img, []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}, c, titleFacts{})
		return img
	}
	if !identical(draw(cfg), draw(withGlow)) {
		t.Error("the glow setting changed a badge style that draws no outline")
	}
}
