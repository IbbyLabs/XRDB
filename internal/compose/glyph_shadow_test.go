package compose

import (
	"image"
	"image/color"
	"testing"
)

// logoWithGap builds a mark with two opaque blocks and empty space between them,
// standing in for the space inside a wordmark.
func logoWithGap(w, h int) *image.NRGBA {
	logo := image.NewNRGBA(image.Rect(0, 0, w, h))
	block := color.NRGBA{255, 255, 255, 255}
	for y := 0; y < h; y++ {
		for x := 0; x < w/4; x++ {
			logo.SetNRGBA(x, y, block)
			logo.SetNRGBA(w-1-x, y, block)
		}
	}
	return logo
}

func whiteCanvas(w, h int) *image.NRGBA {
	base := image.NewNRGBA(image.Rect(0, 0, w, h))
	for i := range base.Pix {
		base.Pix[i] = 255
	}
	return base
}

// The old treatment shaded the logo's bounding box, so the empty space inside a
// wordmark was darkened too and read as a shadow cast by an invisible rectangle.
// The shadow has to follow the glyphs.
func TestTheShadowFollowsTheGlyphsNotTheBoundingBox(t *testing.T) {
	const w, h = 120, 60
	base := whiteCanvas(400, 200)
	drawGlyphShadow(base, logoWithGap(w, h), 140, 70, 50, 100)

	underGlyph := int(base.NRGBAAt(140+w/8, 70+h/2).R)
	underGap := int(base.NRGBAAt(140+w/2, 70+h/2).R)

	if underGlyph >= underGap {
		t.Fatalf("want the glyph darker than the gap between them, glyph %d gap %d", underGlyph, underGap)
	}
}

// A shadow that stops dead at the mark's edge is a box again. It has to fall off
// outward into the artwork.
func TestTheShadowFallsOffOutwards(t *testing.T) {
	const w, h = 120, 60
	base := whiteCanvas(400, 200)
	drawGlyphShadow(base, logoWithGap(w, h), 140, 70, 50, 100)

	justOutside := int(base.NRGBAAt(140-3, 70+h/2).R)
	farOutside := int(base.NRGBAAt(140-60, 70+h/2).R)

	if justOutside >= 255 {
		t.Error("the shadow does not reach past the mark at all")
	}
	if farOutside <= justOutside {
		t.Errorf("want the shadow lighter further out, near %d far %d", justOutside, farOutside)
	}
}

// Strength zero takes the built-in default rather than drawing nothing, matching
// how every other zero-means-default control behaves.
func TestAFullyTransparentLogoCastsNothing(t *testing.T) {
	base := whiteCanvas(200, 120)
	empty := image.NewNRGBA(image.Rect(0, 0, 40, 20))
	drawGlyphShadow(base, empty, 80, 50, 50, 100)
	if got := base.NRGBAAt(100, 60).R; got != 255 {
		t.Errorf("want the canvas untouched by an empty mark, got %d", got)
	}
}
