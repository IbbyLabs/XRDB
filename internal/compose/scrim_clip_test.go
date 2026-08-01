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
	drawScrimBand(base, logoTopY, 4, dstH, scrimSize, 100)

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

// A band that darkens the whole width evenly reads as a bar laid over the
// picture on flat pale artwork. It has to fade out towards the edges.
func TestTheScrimFadesOutTowardsTheEdges(t *testing.T) {
	const baseW, baseH, dstW, dstH = 400, 200, 80, 40
	base := image.NewNRGBA(image.Rect(0, 0, baseW, baseH))
	for i := range base.Pix {
		base.Pix[i] = 255
	}
	drawScrimBand(base, 80, dstW, dstH, 50, 100)

	row := 80 + dstH/2 // the darkest row, on the logo
	centre := int(base.NRGBAAt(baseW/2, row).R)
	edge := int(base.NRGBAAt(2, row).R)

	if centre >= edge {
		t.Fatalf("want the centre darker than the edge, got centre %d edge %d", centre, edge)
	}
	if edge < 250 {
		t.Errorf("want the far edge left nearly untouched, got %d", edge)
	}
}

// Behind the logo itself the shading must stay at full strength, or the thing
// it exists to make readable loses its backing.
func TestTheScrimIsFullStrengthBehindTheLogo(t *testing.T) {
	const baseW, baseH, dstW, dstH = 400, 200, 80, 40
	base := image.NewNRGBA(image.Rect(0, 0, baseW, baseH))
	for i := range base.Pix {
		base.Pix[i] = 255
	}
	drawScrimBand(base, 80, dstW, dstH, 50, 100)

	row := 80 + dstH/2
	centre := int(base.NRGBAAt(baseW/2, row).R)
	logoEdge := int(base.NRGBAAt(baseW/2-dstW/2, row).R)
	if logoEdge != centre {
		t.Errorf("want even shading across the logo, centre %d vs logo edge %d", centre, logoEdge)
	}
}
