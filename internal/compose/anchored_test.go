package compose

import (
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// Anchoring is meant to put the row against the edge it hangs from, so the
// topmost ink has to move up when it is on.
func TestAnchoredTopRowSitsAgainstTheEdge(t *testing.T) {
	ensureFaces()
	ensureIcons()

	ratings := []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}
	floating := imageconfig.Default()
	floating.Ratings = []string{"imdb"}
	floating.RatingsLayout = imageconfig.LayoutTop
	anchored := floating
	anchored.RatingsAnchored = true

	topInk := func(cfg imageconfig.Config) int {
		img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
		drawBadgesInPlace(img, ratings, cfg)
		for y := 0; y < 600; y++ {
			for x := 0; x < 400; x++ {
				if img.NRGBAAt(x, y).A > 0 {
					return y
				}
			}
		}
		return -1
	}

	free, held := topInk(floating), topInk(anchored)
	if held < 0 || free < 0 {
		t.Fatal("no badges were drawn")
	}
	if held >= free {
		t.Errorf("anchoring did not move the row to the edge: floating=%d anchored=%d", free, held)
	}
	if held != 0 {
		t.Errorf("the anchored row starts at y=%d, want the top edge", held)
	}
}

// The point of squaring is that the anchored corner is filled where a rounded
// one would leave the background showing.
func TestSquaredCornersFillTheAnchoredEdge(t *testing.T) {
	rect := image.Rect(0, 0, 60, 30)
	fill := color.NRGBA{R: 200, G: 30, B: 30, A: 255}

	rounded := image.NewNRGBA(rect)
	fillRoundedRect(rounded, rect, 12, fill)
	squared := image.NewNRGBA(rect)
	fillRoundedRectSquared(squared, rect, 12, squareTop, fill)

	if rounded.NRGBAAt(0, 0).A != 0 {
		t.Fatal("the rounded corner was already filled, so the test proves nothing")
	}
	if squared.NRGBAAt(0, 0).A == 0 {
		t.Error("the squared top-left corner was left empty")
	}
	// The far edge keeps its curve.
	if squared.NRGBAAt(0, 29).A != 0 {
		t.Error("squaring the top edge also squared the bottom")
	}
}

func TestSquaredCornersForMapsEachEdge(t *testing.T) {
	cases := map[string]squaredCorners{
		"top": squareTop, "bottom": squareBottom,
		"left": squareLeft, "right": squareRight, "none": squareNone,
	}
	for layout, want := range cases {
		if got := squaredCornersFor(layout); got != want {
			t.Errorf("squaredCornersFor(%q) = %v, want %v", layout, got, want)
		}
	}
}
