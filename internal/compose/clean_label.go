package compose

import (
	"image"
	"math"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// The clean genre label: a grotesque bold at 20px, v2's half of a 40px badge.
const (
	cleanLabelSize     = 20.0 // px
	cleanLabelTracking = 0.01 // em
	cleanLabelAlpha    = 220
)

var (
	scaledCleanFaces sync.Map
)

func cleanFont() *opentype.Font { return parsedBadgeFont(cleanLabelFile) }

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
	tt := cleanFont()
	if tt == nil {
		return labelFaceFor(scale * 1.2)
	}
	key := int(scale * 100)
	if f, ok := scaledCleanFaces.Load(key); ok {
		return f.(font.Face)
	}
	size := cleanLabelSize * scale
	f, err := opentype.NewFace(tt, &opentype.FaceOptions{
		Size: size, DPI: 72, Hinting: font.HintingFull,
	})
	if err != nil {
		return labelFaceFor(scale * 1.2)
	}
	lf := &lockedFace{inner: trackedFace{Face: f, track: fixed.Int26_6(cleanLabelTracking * size * 64)}}
	actual, _ := scaledCleanFaces.LoadOrStore(key, lf)
	return actual.(font.Face)
}

// cleanLabelScale sizes the clean label to the frame as v2 did: against a
// 580x859 poster or a 1280x720 backdrop, raised to the 1.05 power.
func cleanLabelScale(b image.Rectangle, scalePercent int) float64 {
	w, h := float64(b.Dx()), float64(b.Dy())
	if w <= 0 || h <= 0 {
		return 1
	}
	linear := math.Min(w/1280, h/720)
	if h > w {
		linear = math.Min(w/580, h/859)
	}
	s := math.Max(0.75, math.Min(5, math.Pow(linear, 1.05)))
	if scalePercent != 0 {
		s *= float64(scalePercent) / 100
	}
	return s
}
