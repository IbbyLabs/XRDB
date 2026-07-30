package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// v2's capsule hugs its contents; v3 padded the same badges into a much wider
// pill. Density moves the padding and the icon gap only, so the mark and the
// value keep their size.
func TestDensityChangesBadgeWidthButNotTheMark(t *testing.T) {
	base := imageconfig.Default()

	loose := base
	loose.RatingBadgeDensity = 140
	tight := base
	tight.RatingBadgeDensity = 60

	dDefault := ratingStripDimsFor(2.0, base)
	dLoose := ratingStripDimsFor(2.0, loose)
	dTight := ratingStripDimsFor(2.0, tight)

	if dTight.padX >= dDefault.padX || dDefault.padX >= dLoose.padX {
		t.Errorf("padX did not follow density: tight=%d default=%d loose=%d",
			dTight.padX, dDefault.padX, dLoose.padX)
	}
	if dTight.iconGap >= dDefault.iconGap || dDefault.iconGap >= dLoose.iconGap {
		t.Errorf("iconGap did not follow density: tight=%d default=%d loose=%d",
			dTight.iconGap, dDefault.iconGap, dLoose.iconGap)
	}
	// The mark is the content, not the spacing around it.
	if dTight.iconSize != dDefault.iconSize || dLoose.iconSize != dDefault.iconSize {
		t.Errorf("density resized the mark: tight=%d default=%d loose=%d",
			dTight.iconSize, dDefault.iconSize, dLoose.iconSize)
	}
}

// A tighter badge has to actually come out narrower, not merely compute smaller
// padding.
func TestTighterDensityDrawsANarrowerRow(t *testing.T) {
	ensureFaces()
	ensureIcons()

	ratings := []provider.Rating{{Source: "imdb", Value: 8.0, Label: "8.0"}}
	base := imageconfig.Default()
	base.Ratings = []string{"imdb"}

	tight := base
	tight.RatingBadgeDensity = 60

	wide := widestBadgeAt(2.0, ratings, base)
	narrow := widestBadgeAt(2.0, ratings, tight)
	if narrow >= wide {
		t.Errorf("density 60 measured %d wide, want less than the default %d", narrow, wide)
	}
}

// v2 outlines the capsule; v3 drew none on the solid styles, so it read as a
// soft blob rather than a defined chip.
func TestCapsuleBorderAppliesToAStyleThatHasNoneOfItsOwn(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.BadgeStyle = imageconfig.BadgePill

	if c := chromeFor(cfg); c.border.A != 0 {
		t.Fatalf("the pill style drew a border before one was asked for: %+v", c.border)
	}

	cfg.RatingBadgeBorderColor = "#ff0000"
	cfg.RatingBadgeBorderOpacity = 40
	c := chromeFor(cfg)
	if c.border.A == 0 {
		t.Fatal("a capsule border was configured but none was set")
	}
	if c.border.R != 255 || c.border.G != 0 || c.border.B != 0 {
		t.Errorf("border colour = %+v, want red", c.border)
	}
	if c.border.A > 128 {
		t.Errorf("border alpha = %d, want a faint value for 40%%", c.border.A)
	}
}
