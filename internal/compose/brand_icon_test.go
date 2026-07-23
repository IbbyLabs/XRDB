package compose

import (
	"image"
	"image/color"
	"testing"
)

func iconOf(c color.NRGBA) image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, 4, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			img.SetNRGBA(x, y, c)
		}
	}
	return img
}

func TestAWhiteGlyphIsRecoloredNotDrawnAsIs(t *testing.T) {
	if isBrandColored(iconOf(color.NRGBA{R: 255, G: 255, B: 255, A: 255})) {
		t.Error("a white-on-transparent glyph must be treated as a mask to recolor")
	}
	// Anti-aliased edges drift slightly off pure white and must not count.
	if isBrandColored(iconOf(color.NRGBA{R: 250, G: 248, B: 252, A: 255})) {
		t.Error("a near-white glyph must still be treated as a mask")
	}
}

func TestABrandMarkKeepsItsOwnColors(t *testing.T) {
	if !isBrandColored(iconOf(color.NRGBA{R: 0, G: 169, B: 157, A: 255})) {
		t.Error("a colored mark must be drawn as it is")
	}
}

func TestTransparentPixelsDoNotDecideTheColor(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	// Fully transparent black padding surrounds most marks.
	img.SetNRGBA(0, 0, color.NRGBA{R: 0, G: 0, B: 0, A: 0})
	img.SetNRGBA(1, 1, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
	if isBrandColored(img) {
		t.Error("transparent padding must not make a white glyph look colored")
	}
}

// The bundled marks decide this at load time, so a color asset must actually be
// recognised as one.
func TestTheBundledLetterboxdMarkIsColored(t *testing.T) {
	ensureIcons()
	if !ratingIconColored["letterboxd"] {
		t.Error("the Letterboxd mark is multi-colored and must render in color")
	}
	if len(ratingIcons) == 0 {
		t.Fatal("no rating icons were loaded")
	}
}
