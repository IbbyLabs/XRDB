package compose

import (
	"image"
	"image/color"
	"testing"
)

// A circle's outline touches its bounding box at four points, so walking the box
// draws almost nothing. The border has to follow the shape the fill uses.
func TestRectBorderFollowsTheShapeOnACircle(t *testing.T) {
	const size = 40
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	r := image.Rect(0, 0, size, size)
	drawRectBorder(img, r, size/2, color.NRGBA{R: 255, G: 0, B: 0, A: 255})

	painted := 0
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			if img.NRGBAAt(x, y).A > 0 {
				painted++
			}
		}
	}
	// A border that follows the curve is roughly the circumference; the
	// bounding-box walk leaves only a handful of pixels.
	if painted < size*2 {
		t.Errorf("painted %d pixels on a %dpx circle border, want at least %d", painted, size, size*2)
	}

	// The leftmost pixel of a circle sits at the vertical midpoint, not the
	// corner, so that is where a shape-following border must have drawn.
	if img.NRGBAAt(0, size/2).A == 0 {
		t.Error("no border at the circle's left tangent point")
	}
	// The box corner is outside the circle and must stay clear.
	if got := img.NRGBAAt(0, 0).A; got != 0 {
		t.Errorf("border drawn at the box corner (alpha %d), which is outside the circle", got)
	}
}

// A square plate has no curve, so the border is the four edges and nothing in
// the middle. This is the case that already worked and must not change.
func TestRectBorderOnASquareStaysOnTheEdges(t *testing.T) {
	const size = 20
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	drawRectBorder(img, image.Rect(0, 0, size, size), 0, color.NRGBA{R: 0, G: 255, B: 0, A: 255})

	if img.NRGBAAt(0, 0).A == 0 {
		t.Error("no border at the corner of a square plate")
	}
	if got := img.NRGBAAt(size/2, size/2).A; got != 0 {
		t.Errorf("border filled the middle of a square plate (alpha %d), want it hollow", got)
	}
}
