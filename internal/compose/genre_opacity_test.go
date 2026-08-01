package compose

import (
	"image"
	"image/color"
	"testing"
)

// A translucent fill has to composite over the artwork. Writing the pixel
// outright discarded what was underneath, so lowering the badge opacity darkened
// it towards black instead of letting the poster through.
func TestSoftTileCompositesATranslucentFill(t *testing.T) {
	red := func() *image.NRGBA {
		img := image.NewNRGBA(image.Rect(0, 0, 40, 20))
		for y := 0; y < 20; y++ {
			for x := 0; x < 40; x++ {
				img.SetNRGBA(x, y, color.NRGBA{R: 255, G: 0, B: 0, A: 255})
			}
		}
		return img
	}

	img := red()
	// 5% opacity: almost all of the artwork should survive.
	drawSoftTile(img, image.Rect(0, 0, 40, 20), 4, tileChrome{fill: color.NRGBA{R: 8, G: 9, B: 12, A: 12}})
	mid := img.NRGBAAt(20, 10)
	if mid.R < 120 {
		t.Errorf("centre is %v after a 5%% fill, want the red artwork mostly intact (R>=120)", mid)
	}

	opaque := red()
	drawSoftTile(opaque, image.Rect(0, 0, 40, 20), 4, tileChrome{fill: color.NRGBA{R: 8, G: 9, B: 12, A: 255}})
	if got := opaque.NRGBAAt(20, 10); got.R > 40 {
		t.Errorf("centre is %v after a fully opaque fill, want the badge to cover the artwork", got)
	}
}
