package compose

import (
	"bytes"
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
	drawGlyphShadow(base, logoWithGap(w, h), 140, 70, glyphShadowOpts{spread: 50, strength: 100})

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
	drawGlyphShadow(base, logoWithGap(w, h), 140, 70, glyphShadowOpts{spread: 50, strength: 100})

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
	drawGlyphShadow(base, empty, 80, 50, glyphShadowOpts{spread: 50, strength: 100})
	if got := base.NRGBAAt(100, 60).R; got != 255 {
		t.Errorf("want the canvas untouched by an empty mark, got %d", got)
	}
}

func greyCanvas(w, h int, level uint8) *image.NRGBA {
	base := image.NewNRGBA(image.Rect(0, 0, w, h))
	for i := 0; i < len(base.Pix); i += 4 {
		base.Pix[i], base.Pix[i+1], base.Pix[i+2], base.Pix[i+3] = level, level, level, 255
	}
	return base
}

// shadowOn draws one treatment onto a fresh white canvas and returns it.
func shadowOn(o glyphShadowOpts) *image.NRGBA {
	base := whiteCanvas(400, 200)
	drawGlyphShadow(base, logoWithGap(120, 60), 140, 70, o)
	return base
}

// Three styles that render the same pixels are one style with three names.
func TestEachShadowStyleDrawsItsOwnPixels(t *testing.T) {
	styles := []string{"", "extrude", "gel"}
	drawn := map[string][]byte{}
	for _, s := range styles {
		drawn[s] = shadowOn(glyphShadowOpts{spread: 50, strength: 100, style: s}).Pix
	}
	for i, a := range styles {
		for _, b := range styles[i+1:] {
			if bytes.Equal(drawn[a], drawn[b]) {
				t.Errorf("styles %q and %q render identical pixels", a, b)
			}
		}
	}
}

// An offset that does not move the shadow is a control that does nothing.
func TestTheOffsetMovesTheShadow(t *testing.T) {
	const rightOfMark, leftOfMark = 290, 105

	unmoved := shadowOn(glyphShadowOpts{spread: 50, strength: 100})
	if got := unmoved.NRGBAAt(rightOfMark, 100).R; got != 255 {
		t.Fatalf("want clear canvas right of the mark, got %d", got)
	}
	if got := unmoved.NRGBAAt(leftOfMark, 100).R; got != 255 {
		t.Fatalf("want clear canvas left of the mark, got %d", got)
	}

	right := shadowOn(glyphShadowOpts{spread: 50, strength: 100, offsetX: 40})
	if got := right.NRGBAAt(rightOfMark, 100).R; got == 255 {
		t.Errorf("want the shadow carried right by the offset, got %d", got)
	}

	left := shadowOn(glyphShadowOpts{spread: 50, strength: 100, offsetX: -40})
	if got := left.NRGBAAt(leftOfMark, 100).R; got == 255 {
		t.Errorf("want the shadow carried left by a negative offset, got %d", got)
	}

	down := shadowOn(glyphShadowOpts{spread: 50, strength: 100, offsetY: 50})
	if got := down.NRGBAAt(150, 175).R; got == 255 {
		t.Errorf("want the shadow carried down the canvas, got %d", got)
	}
}

// A coloured shadow is the point of the colour control, so it has to keep its
// hue rather than darkening towards black like the default.
func TestAColouredShadowKeepsItsHue(t *testing.T) {
	base := whiteCanvas(400, 200)
	drawGlyphShadow(base, logoWithGap(120, 60), 140, 70, glyphShadowOpts{
		spread: 50, strength: 100, offsetY: 40,
		color: color.NRGBA{R: 255, G: 0, B: 0, A: 255},
	})
	px := base.NRGBAAt(150, 140)
	if px.R <= px.G || px.R <= px.B {
		t.Errorf("want a red cast under the mark, got %+v", px)
	}
	if px.G >= 250 {
		t.Errorf("want the shadow to draw at all, got %+v", px)
	}
}

// The extrusion is a solid slab, so it stays dark to its far end and stops
// there. A blur in its place fades out well before.
func TestTheExtrusionIsSolidToItsFarEdge(t *testing.T) {
	base := whiteCanvas(400, 200)
	drawGlyphShadow(base, logoWithGap(120, 60), 140, 70, glyphShadowOpts{
		spread: 50, strength: 100, offsetX: 40, style: "extrude",
	})

	// The mark's right edge is at 259, so the slab runs to 299.
	if got := base.NRGBAAt(297, 100).R; got > 150 {
		t.Errorf("want the slab still dark at its far end, got %d", got)
	}
	if got := base.NRGBAAt(305, 100).R; got < 240 {
		t.Errorf("want the slab to stop at its far end, got %d", got)
	}
}

// The gel look is a shadow one way and a highlight the other. With only a
// shadow it is the drop shadow again.
func TestTheGelStyleLightensOneSideAndDarkensTheOther(t *testing.T) {
	const mid = 128
	base := greyCanvas(400, 200, mid)
	drawGlyphShadow(base, logoWithGap(120, 60), 140, 70, glyphShadowOpts{
		spread: 50, strength: 100, offsetX: 6, offsetY: 6, style: "gel",
	})

	above := int(base.NRGBAAt(150, 66).R)
	below := int(base.NRGBAAt(150, 133).R)

	if above <= mid {
		t.Errorf("want a highlight above the mark, got %d", above)
	}
	if below >= mid {
		t.Errorf("want a shadow below the mark, got %d", below)
	}
	// A highlight as strong as the shadow reads as a white outline.
	if above-mid >= mid-below {
		t.Errorf("want the highlight fainter than the shadow, highlight %d shadow %d", above-mid, mid-below)
	}
}
