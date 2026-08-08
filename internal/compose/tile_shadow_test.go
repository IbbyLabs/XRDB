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

// The same shadow alpha has to read the same weight on a small badge and a large
// one, so a tile does not lighten as it scales.
func TestTileShadowWeightDoesNotVaryWithTileSize(t *testing.T) {
	const bg = 232
	darkest := func(h int) int {
		w, ih := h*4, h*3
		base := image.NewNRGBA(image.Rect(0, 0, w, ih))
		for y := 0; y < ih; y++ {
			for x := 0; x < w; x++ {
				base.SetNRGBA(x, y, color.NRGBA{R: bg, G: bg, B: bg, A: 255})
			}
		}
		r := image.Rect(h, h/2, w-h, h/2+h)
		drawTileShadow(base, r, h/2, color.NRGBA{A: 70})
		lo := bg
		for y := r.Max.Y; y < ih; y++ {
			if v := int(base.NRGBAAt(w/2, y).R); v < lo {
				lo = v
			}
		}
		return lo
	}

	small, large := darkest(36), darkest(180)
	if d := small - large; d > 6 || d < -6 {
		t.Errorf("darkest shadow row is %d on a 36px tile and %d on a 180px one, want them within 6", small, large)
	}
}
