package compose

import (
	"image"
	"math"
	"testing"
)

// scrimPeakRow reports the darkest row of the scrim drawn behind a logo placed
// at logoTopY, by measuring how far each row was darkened from white.
func scrimPeakRow(t *testing.T, baseH, logoTopY, dstH, scrimSize int) int {
	t.Helper()
	base := image.NewNRGBA(image.Rect(0, 0, 8, baseH))
	for i := range base.Pix {
		base.Pix[i] = 255
	}
	drawScrimBand(base, logoTopY, dstH, scrimSize, 100)

	peak, darkest := -1, 255
	for y := 0; y < baseH; y++ {
		if v := int(base.NRGBAAt(0, y).R); v < darkest {
			darkest, peak = v, y
		}
	}
	if peak < 0 {
		t.Fatal("the scrim darkened nothing")
	}
	return peak
}

// The darkest point belongs on the logo. It used to be placed at the midpoint of
// whatever survived clipping, so a band running past an edge dragged the shading
// away from the thing it exists to make readable.
func TestTheScrimPeakStaysOnTheLogoAtAnEdge(t *testing.T) {
	const baseH, dstH = 400, 40

	cases := []struct {
		name      string
		logoTopY  int
		scrimSize int
		tolerance int
	}{
		{"clear of both edges", 200, 50, 2},
		{"band runs off the top", 20, 200, 2},
		{"band runs off the bottom", 350, 200, 2},
		{"band far larger than the canvas", 200, 500, 2},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			want := c.logoTopY + dstH/2 // the logo's centre
			got := scrimPeakRow(t, baseH, c.logoTopY, dstH, c.scrimSize)
			// A peak clipped entirely off-canvas lands at the nearest edge,
			// which is still the closest point to the logo.
			if want < 0 {
				want = 0
			}
			if want > baseH-1 {
				want = baseH - 1
			}
			if math.Abs(float64(got-want)) > float64(c.tolerance) {
				t.Errorf("darkest row %d, want the logo centre %d (+/-%d)", got, want, c.tolerance)
			}
		})
	}
}
