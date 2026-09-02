package compose

import (
	"image"
	"image/color"
	"testing"

	"golang.org/x/image/font/basicfont"
)

// The centre disc is drawn under the ring's number, so "invisible" has to reach
// the pixels rather than only the config.
func TestAnInvisibleRingCentreDrawsNoDisc(t *testing.T) {
	centreAlpha := func(opacity int) uint8 {
		img := image.NewNRGBA(image.Rect(0, 0, 200, 200))
		drawProgressRing(img, 100, 100, 60, 0.5, color.NRGBA{R: 240, G: 80, B: 60, A: 255}, basicfont.Face7x13, "7.5", opacity)
		return img.NRGBAAt(100, 100).A
	}

	invisible := centreAlpha(-1)
	unset := centreAlpha(0)
	half := centreAlpha(50)

	if unset == 0 {
		t.Fatal("the default centre drew nothing, so this test cannot tell invisible from it")
	}
	if invisible >= unset {
		t.Errorf("invisible centre alpha %d, want less than the default %d", invisible, unset)
	}
	if half == 0 || half == unset {
		t.Errorf("a configured 50%% centre drew %d, want its own value between nothing and the default %d", half, unset)
	}
}
