package compose

import (
	"image"
	"testing"
)

// The plain style drew a fixed dark drop shadow and ignored the outline controls
// that the other plain badges answer, so there was no way to outline it at all.
func TestAgeRatingPlainHonoursTheOutlineControls(t *testing.T) {
	draw := func(opts ageRatingOpts) *image.NRGBA {
		base := image.NewNRGBA(image.Rect(0, 0, 300, 120))
		drawAgeRatingBadge(base, "PG-13", "top-left", 1, newOccupancy(image.Rect(0, 0, 300, 120)), opts)
		return base
	}

	plain := ageRatingOpts{style: "plain"}
	outlined := ageRatingOpts{style: "plain", outlineColor: "#FF0000", outlineWidth: 2}

	countRed := func(img *image.NRGBA) int {
		n := 0
		b := img.Bounds()
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				c := img.NRGBAAt(x, y)
				if c.A > 40 && c.R > 180 && c.G < 90 && c.B < 90 {
					n++
				}
			}
		}
		return n
	}

	if got := countRed(draw(plain)); got != 0 {
		t.Fatalf("unconfigured plain style drew %d red pixels, want none", got)
	}
	if got := countRed(draw(outlined)); got == 0 {
		t.Error("plain style drew no outline pixels with an outline colour set")
	}
}
