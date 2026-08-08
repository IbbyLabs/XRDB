package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func layoutTestRatings() []provider.Rating {
	return []provider.Rating{
		{Source: "imdb", Value: 8.5, Label: "8.5"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
		{Source: "rt", Value: 9.1, Label: "9.1"},
		{Source: "metacritic", Value: 7.2, Label: "7.2"},
	}
}

func layoutTestConfig(l imageconfig.RatingsLayout) imageconfig.Config {
	return imageconfig.Config{
		Ratings:       []string{"imdb", "tmdb", "rt", "metacritic"},
		RatingsLayout: l,
	}
}

// paintedBounds returns the bounding box of every pixel that differs from the
// blank test canvas, which is where the badges were actually drawn.
func paintedBounds(t *testing.T, img *image.NRGBA) image.Rectangle {
	t.Helper()
	blank := genreTestImage()
	out := image.Rectangle{}
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y) != blank.NRGBAAt(x, y) {
				px := image.Rect(x, y, x+1, y+1)
				if out.Empty() {
					out = px
				} else {
					out = out.Union(px)
				}
			}
		}
	}
	if out.Empty() {
		t.Fatal("nothing was drawn")
	}
	return out
}

// A v2 profile set to "left" or "right" wants every badge stacked in one column
// against that edge. Both used to fall through to the bottom strip, which is
// what made a migrated poster look rearranged.
func TestSingleSidedLayoutsDrawAgainstTheirEdge(t *testing.T) {
	ratings := layoutTestRatings()

	img := genreTestImage()
	drawBadgesInPlace(img, ratings, layoutTestConfig(imageconfig.LayoutLeft), titleFacts{})
	left := paintedBounds(t, img)

	img = genreTestImage()
	drawBadgesInPlace(img, ratings, layoutTestConfig(imageconfig.LayoutRight), titleFacts{})
	right := paintedBounds(t, img)

	full := genreTestImage().Bounds()
	midX := full.Min.X + full.Dx()/2

	if left.Max.X > midX {
		t.Errorf("left layout spilled past the midline: painted %v, midline x=%d", left, midX)
	}
	if right.Min.X < midX {
		t.Errorf("right layout spilled past the midline: painted %v, midline x=%d", right, midX)
	}

	// A column, not a strip: four badges stacked are taller than they are wide.
	if left.Dy() <= left.Dx() {
		t.Errorf("left layout is not a vertical column: %v", left)
	}
}

// The whole point of choosing left/right over split-side is that nothing is
// left on the other edge.
func TestSingleSidedLayoutsKeepEveryBadgeOnOneSide(t *testing.T) {
	specs := make([]badgeSpec, 4)

	left, right := splitBadgesForSideLayout(specs, imageconfig.LayoutLeft)
	if len(left) != 4 || len(right) != 0 {
		t.Errorf("left layout split %d/%d, want 4/0", len(left), len(right))
	}

	left, right = splitBadgesForSideLayout(specs, imageconfig.LayoutRight)
	if len(left) != 0 || len(right) != 4 {
		t.Errorf("right layout split %d/%d, want 0/4", len(left), len(right))
	}

	left, right = splitBadgesForSideLayout(specs, imageconfig.LayoutSplitSide)
	if len(left) != 2 || len(right) != 2 {
		t.Errorf("split-side split %d/%d, want 2/2", len(left), len(right))
	}
}

// An odd count must not drop a badge on any side layout.
func TestSideLayoutsDropNoBadges(t *testing.T) {
	for _, l := range []imageconfig.RatingsLayout{imageconfig.LayoutLeft, imageconfig.LayoutRight, imageconfig.LayoutSplitSide} {
		for _, n := range []int{1, 2, 3, 5} {
			left, right := splitBadgesForSideLayout(make([]badgeSpec, n), l)
			if got := len(left) + len(right); got != n {
				t.Errorf("%s with %d badges kept %d", l, n, got)
			}
		}
	}
}

// top-bottom puts a row against each edge, so it must paint near both.
func TestTopBottomLayoutDrawsAgainstBothEdges(t *testing.T) {
	img := genreTestImage()
	drawBadgesInPlace(img, layoutTestRatings(), layoutTestConfig(imageconfig.LayoutTopBottom), titleFacts{})
	painted := paintedBounds(t, img)

	full := genreTestImage().Bounds()
	if painted.Min.Y > full.Min.Y+full.Dy()/4 {
		t.Errorf("top-bottom did not reach the top edge: painted %v", painted)
	}
	if painted.Max.Y < full.Max.Y-full.Dy()/4 {
		t.Errorf("top-bottom did not reach the bottom edge: painted %v", painted)
	}
}

// Each layout must render distinguishably, or a user changing the setting sees
// nothing happen.
func TestEachRatingsLayoutRendersDistinctly(t *testing.T) {
	ratings := layoutTestRatings()
	layouts := []imageconfig.RatingsLayout{
		imageconfig.LayoutTop, imageconfig.LayoutBottom, imageconfig.LayoutLeft,
		imageconfig.LayoutRight, imageconfig.LayoutSplitSide, imageconfig.LayoutTopBottom,
	}
	rendered := make(map[imageconfig.RatingsLayout]*image.NRGBA, len(layouts))
	for _, l := range layouts {
		img := genreTestImage()
		drawBadgesInPlace(img, ratings, layoutTestConfig(l), titleFacts{})
		rendered[l] = img
	}
	for i, a := range layouts {
		for _, b := range layouts[i+1:] {
			if !imagesDiffer(rendered[a], rendered[b]) {
				t.Errorf("layouts %q and %q render identically", a, b)
			}
		}
	}
}

// Side layouts sit in a column against one edge, so they clear no full-width
// band for the logo to be letterboxed above.
func TestSideLayoutsReserveNoFullWidthBand(t *testing.T) {
	ratings := layoutTestRatings()
	for _, l := range []imageconfig.RatingsLayout{imageconfig.LayoutLeft, imageconfig.LayoutRight, imageconfig.LayoutSplitSide} {
		if h := ratingsBandHeight(600, 900, ratings, layoutTestConfig(l), titleFacts{}); h != 0 {
			t.Errorf("%s reserved a band of %d, want 0", l, h)
		}
	}
	if h := ratingsBandHeight(600, 900, ratings, layoutTestConfig(imageconfig.LayoutBottom), titleFacts{}); h == 0 {
		t.Error("bottom layout reserved no band")
	}
}

// The stacked style puts the mark above the value rather than beside it, so a
// badge is taller than the horizontal styles and reads as a column.
func TestStackedBadgeStyleIsTallerThanTheRowStyles(t *testing.T) {
	// One rating, so the measurement is a single badge rather than a strip that
	// wraps to a different number of rows per style.
	ratings := layoutTestRatings()[:1]
	cfg := layoutTestConfig(imageconfig.LayoutBottom)

	pill := cfg
	pill.BadgeStyle = imageconfig.BadgePill
	stacked := cfg
	stacked.BadgeStyle = imageconfig.BadgeStacked

	imgPill := genreTestImage()
	drawBadgesInPlace(imgPill, ratings, pill, titleFacts{})
	imgStacked := genreTestImage()
	drawBadgesInPlace(imgStacked, ratings, stacked, titleFacts{})

	if !imagesDiffer(imgPill, imgStacked) {
		t.Fatal("the stacked style renders the same as the pill")
	}
	if a, b := paintedBounds(t, imgStacked).Dy(), paintedBounds(t, imgPill).Dy(); a <= b {
		t.Errorf("stacked badge height %d, want more than the pill's %d", a, b)
	}
}

// Every rating style must render distinguishably, or picking one does nothing.
func TestEachBadgeStyleRendersDistinctly(t *testing.T) {
	ratings := layoutTestRatings()
	styles := imageconfig.BadgeStyles
	rendered := map[imageconfig.BadgeStyle]*image.NRGBA{}
	for _, st := range styles {
		cfg := layoutTestConfig(imageconfig.LayoutBottom)
		cfg.BadgeStyle = st
		img := genreTestImage()
		drawBadgesInPlace(img, ratings, cfg, titleFacts{})
		rendered[st] = img
	}
	for i, a := range styles {
		for _, b := range styles[i+1:] {
			if !imagesDiffer(rendered[a], rendered[b]) {
				t.Errorf("styles %q and %q render identically", a, b)
			}
		}
	}
}

// A token with no tile of its own must not be drawn as its own name: that is
// how a migrated poster ended up with a column of words down the side.
func TestUnknownQualityTokensAreNotDrawnAsText(t *testing.T) {
	img := genreTestImage()
	drawn := drawQualityBadges(img, []string{"oscarwinner", "netflix", "bingeready"}, 1.0, newOccupancy(img.Bounds()), qualityBadgeOpts{})
	if drawn != 0 {
		t.Errorf("drew %d badges for tokens with no tile", drawn)
	}
	if imagesDiffer(img, genreTestImage()) {
		t.Error("tokens with no tile painted something")
	}

	// The real ones still draw.
	img2 := genreTestImage()
	if n := drawQualityBadges(img2, []string{"4k", "bluray", "remux"}, 1.0, newOccupancy(img2.Bounds()), qualityBadgeOpts{}); n != 3 {
		t.Errorf("drew %d of 3 quality tiles", n)
	}
}

// A large multiplier on a small frame used to draw a badge wider and taller
// than the artwork, so the tile ran off the edge and took the score with it.
// The scale is backed off to the biggest that fits instead.
func TestBadgeScaleIsClampedToTheFrame(t *testing.T) {
	ratings := layoutTestRatings()[:3]
	cfg := layoutTestConfig(imageconfig.LayoutBottom)
	cfg.Ratings = []string{"imdb", "tmdb", "rt"}
	cfg.BadgeStyle = imageconfig.BadgeStacked
	cfg.RatingBadgeScale = 400

	img := genreTestImage()
	drawBadgesInPlace(img, ratings, cfg, titleFacts{})
	painted := paintedBounds(t, img)
	frame := genreTestImage().Bounds()

	if painted.Min.X < frame.Min.X || painted.Max.X > frame.Max.X {
		t.Errorf("badges ran off the sides: painted %v, frame %v", painted, frame)
	}
	if painted.Min.Y < frame.Min.Y || painted.Max.Y > frame.Max.Y {
		t.Errorf("badges ran off the top or bottom: painted %v, frame %v", painted, frame)
	}
}

// The clamp must not shrink a strip that already fits.
func TestBadgeScaleClampLeavesAFittingStripAlone(t *testing.T) {
	ratings := layoutTestRatings()[:2]
	cfg := layoutTestConfig(imageconfig.LayoutBottom)
	cfg.Ratings = []string{"imdb", "tmdb"}
	if got := fitBadgeScale(1.0, 2000, 3000, ratings, cfg, titleFacts{}); got != 1.0 {
		t.Errorf("a strip that fits was scaled to %v, want 1.0", got)
	}
}
