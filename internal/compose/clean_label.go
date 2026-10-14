package compose

import (
	"image"
	"image/color"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// The clean genre label: bold at the tiled label's size times 1.2, tracked tight.
const (
	cleanLabelSize     = 17 * 1.2 // pt at 96 DPI
	cleanLabelTracking = -0.03    // em
)

var scaledCleanFaces sync.Map

// trackedFace adds a fixed amount to every glyph advance.
type trackedFace struct {
	font.Face
	track fixed.Int26_6
}

func (f trackedFace) Glyph(dot fixed.Point26_6, r rune) (image.Rectangle, image.Image, image.Point, fixed.Int26_6, bool) {
	dr, mask, mp, adv, ok := f.Face.Glyph(dot, r)
	return dr, mask, mp, adv + f.track, ok
}

func (f trackedFace) GlyphBounds(r rune) (fixed.Rectangle26_6, fixed.Int26_6, bool) {
	b, adv, ok := f.Face.GlyphBounds(r)
	return b, adv + f.track, ok
}

func (f trackedFace) GlyphAdvance(r rune) (fixed.Int26_6, bool) {
	adv, ok := f.Face.GlyphAdvance(r)
	return adv + f.track, ok
}

// cleanLabelFaceFor returns the clean style's label face for the output scale.
func cleanLabelFaceFor(scale float64) font.Face {
	ensureFaces()
	if fontBoldParsed == nil {
		return labelFaceFor(scale * 1.2)
	}
	key := int(scale * 100)
	if f, ok := scaledCleanFaces.Load(key); ok {
		return f.(font.Face)
	}
	size := cleanLabelSize * scale
	f, err := opentype.NewFace(fontBoldParsed, &opentype.FaceOptions{
		Size: size, DPI: 96, Hinting: font.HintingFull,
	})
	if err != nil {
		return labelFaceFor(scale * 1.2)
	}
	lf := &lockedFace{inner: trackedFace{Face: f, track: fixed.Int26_6(cleanLabelTracking * size * 96 / 72 * 64)}}
	actual, _ := scaledCleanFaces.LoadOrStore(key, lf)
	return actual.(font.Face)
}

// drawTextShadow lays a soft shadow of s, offset below the baseline at (x, y).
func drawTextShadow(base *image.NRGBA, face font.Face, x, y int, s string, scale float64) {
	fm := face.Metrics()
	ascent, descent := fm.Ascent.Ceil(), fm.Descent.Ceil()
	w := textWidth(face, s)
	if w <= 0 {
		return
	}
	mask := image.NewNRGBA(image.Rect(0, 0, w, ascent+descent))
	drawText(mask, face, 0, ascent, color.NRGBA{A: 255}, s)
	radius := maxInt(1, int(2*scale+0.5))
	drawSoftShadow(base, mask, x, y-ascent, radius, 0, maxInt(1, int(scale+0.5)), 85, color.NRGBA{A: 255})
}
