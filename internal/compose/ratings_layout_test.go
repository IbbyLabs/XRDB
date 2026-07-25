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
	drawBadgesInPlace(img, ratings, layoutTestConfig(imageconfig.LayoutLeft))
	left := paintedBounds(t, img)

	img = genreTestImage()
	drawBadgesInPlace(img, ratings, layoutTestConfig(imageconfig.LayoutRight))
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
	drawBadgesInPlace(img, layoutTestRatings(), layoutTestConfig(imageconfig.LayoutTopBottom))
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
		drawBadgesInPlace(img, ratings, layoutTestConfig(l))
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
		if h := ratingsBandHeight(600, ratings, layoutTestConfig(l)); h != 0 {
			t.Errorf("%s reserved a band of %d, want 0", l, h)
		}
	}
	if h := ratingsBandHeight(600, ratings, layoutTestConfig(imageconfig.LayoutBottom)); h == 0 {
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
	drawBadgesInPlace(imgPill, ratings, pill)
	imgStacked := genreTestImage()
	drawBadgesInPlace(imgStacked, ratings, stacked)

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
	styles := []imageconfig.BadgeStyle{
		imageconfig.BadgePill, imageconfig.BadgeSquare, imageconfig.BadgeGlass,
		imageconfig.BadgePlain, imageconfig.BadgeTile, imageconfig.BadgeStacked,
	}
	rendered := map[imageconfig.BadgeStyle]*image.NRGBA{}
	for _, st := range styles {
		cfg := layoutTestConfig(imageconfig.LayoutBottom)
		cfg.BadgeStyle = st
		img := genreTestImage()
		drawBadgesInPlace(img, ratings, cfg)
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
