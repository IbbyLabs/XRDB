package compose

import (
	"image"
	"testing"
)

// The pill's border was a hard-coded white hairline, so a dark capsule with a
// coloured border, which is what the v2 genre badge looked like, could not be
// configured at all.
func TestGenrePillBorderTakesTheAccentColour(t *testing.T) {
	draw := func(opts genreBadgeOpts) *image.NRGBA {
		base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
		drawGenreBadge(base, []string{"Drama"}, "bottom-left", 1, newOccupancy(image.Rect(0, 0, 400, 200)), opts)
		return base
	}
	countTeal := func(img *image.NRGBA) int {
		n := 0
		b := img.Bounds()
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				c := img.NRGBAAt(x, y)
				if c.A > 40 && c.R < 90 && c.G > 140 && c.B > 130 {
					n++
				}
			}
		}
		return n
	}

	plain := genreBadgeOpts{style: "pill"}
	accented := genreBadgeOpts{style: "pill", tileColor: "#00A99D"}

	if got := countTeal(draw(plain)); got != 0 {
		t.Fatalf("pill drew %d accent-coloured pixels with no accent set", got)
	}
	if got := countTeal(draw(accented)); got == 0 {
		t.Error("pill drew no accent-coloured border with an accent colour set")
	}
}
