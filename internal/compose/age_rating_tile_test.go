package compose

import (
	"image"
	"testing"
)

func drawAgeRating(opts ageRatingOpts) *image.NRGBA {
	base := image.NewNRGBA(image.Rect(0, 0, 300, 120))
	drawAgeRatingBadge(base, "PG-13", "top-left", 1, newOccupancy(image.Rect(0, 0, 300, 120)), opts)
	return base
}

func identical(a, b *image.NRGBA) bool {
	if a.Bounds() != b.Bounds() {
		return false
	}
	for i := range a.Pix {
		if a.Pix[i] != b.Pix[i] {
			return false
		}
	}
	return true
}

// Choosing "tile" with no colour set gave a badge indistinguishable from "glass":
// the tile branch only diverged once a colour parsed, so the style silently did
// nothing. A style has to look like itself without a second setting (BUG-212).
func TestAgeRatingTileDiffersFromGlassWithoutAColour(t *testing.T) {
	glass := drawAgeRating(ageRatingOpts{style: "glass"})
	tile := drawAgeRating(ageRatingOpts{style: "tile"})

	if identical(glass, tile) {
		t.Error("tile with no colour renders identically to glass, so the style has no effect")
	}
}

// The control: a colour still reaches the tile, and still changes it. Without this
// the test above could be satisfied by breaking tile in any direction at all.
func TestAgeRatingTileStillAnswersItsColour(t *testing.T) {
	plainTile := drawAgeRating(ageRatingOpts{style: "tile"})
	coloured := drawAgeRating(ageRatingOpts{style: "tile", tileColor: "#C81E1E"})

	if identical(plainTile, coloured) {
		t.Error("ageRatingTileColor no longer changes the tile")
	}

	countRed := 0
	b := coloured.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := coloured.NRGBAAt(x, y)
			if c.A > 200 && c.R > 150 && c.G < 90 && c.B < 90 {
				countRed++
			}
		}
	}
	if countRed == 0 {
		t.Error("the requested tile colour is not present in the render")
	}
}
