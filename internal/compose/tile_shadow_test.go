package compose

import (
	"image"
	"image/color"
	"testing"
)

// A tile's drop shadow used to be one offset copy of the tile, so it ended on a
// hard edge a couple of pixels below the tile's own outline. Two crisp edges
// that close together read as one misplaced outline.
func TestTileShadowFadesOutBelowTheTile(t *testing.T) {
	const bg = 232
	base := image.NewNRGBA(image.Rect(0, 0, 120, 90))
	for y := 0; y < 90; y++ {
		for x := 0; x < 120; x++ {
			base.SetNRGBA(x, y, color.NRGBA{R: bg, G: bg, B: bg, A: 255})
		}
	}
	r := image.Rect(20, 20, 100, 56)
	drawSoftTile(base, r, r.Dy()/2, tileChrome{
		fill:        color.NRGBA{R: 8, G: 9, B: 12, A: 235},
		border:      color.NRGBA{R: 255, G: 255, B: 255, A: 48},
		borderWidth: 2,
		shadow:      color.NRGBA{R: 0, G: 0, B: 0, A: 70},
	})

	x := (r.Min.X + r.Max.X) / 2
	if got := base.NRGBAAt(x, r.Max.Y).R; got >= bg {
		t.Fatalf("row below the tile is %d, want it darkened by a shadow (<%d)", got, bg)
	}

	// Walk the shadow band out to clean artwork. The largest step between
	// adjacent rows is what the eye reads as an edge.
	worst, at := 0, 0
	prev := int(base.NRGBAAt(x, r.Max.Y).R)
	for y := r.Max.Y + 1; y < 90; y++ {
		cur := int(base.NRGBAAt(x, y).R)
		if d := cur - prev; d > worst {
			worst, at = d, y
		}
		prev = cur
		if cur >= bg {
			break
		}
	}
	if worst > 20 {
		t.Errorf("shadow steps %d levels at y=%d, want it to fade (<=20 per row)", worst, at)
	}
}
