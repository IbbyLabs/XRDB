package compose

import (
	"image"
	"image/color"
	"testing"
)

// FR-213: the clean genre label is bold, tracked tighter than the bold face, and casts a shadow.
func TestCleanLabelIsBoldTrackedAndShadowed(t *testing.T) {
	ensureFaces()
	face := cleanLabelFaceFor(1)
	inner := face.(*lockedFace).inner.(trackedFace)
	if inner.track >= 0 {
		t.Fatalf("clean label tracking = %v, want negative", inner.track)
	}
	if tracked, untracked := textWidth(face, "Science Fiction"), textWidth(inner.Face, "Science Fiction"); tracked >= untracked {
		t.Errorf("tracked width %d is not narrower than untracked %d", tracked, untracked)
	}

	render := func(noShadow bool) *image.NRGBA {
		img := image.NewNRGBA(image.Rect(0, 0, 400, 120))
		for i := range img.Pix {
			img.Pix[i] = 200
		}
		drawGenreBadge(img, []string{"Anime"}, "tc", 1, newOccupancy(img.Bounds()), genreBadgeOpts{style: "clean", maxGenres: 1, noShadow: noShadow})
		return img
	}
	lum := func(img *image.NRGBA) int {
		sum := 0
		for y := 0; y < img.Bounds().Dy(); y++ {
			for x := 0; x < img.Bounds().Dx(); x++ {
				c := img.NRGBAAt(x, y)
				if c != (color.NRGBA{R: 255, G: 255, B: 255, A: 255}) {
					sum += int(c.R)
				}
			}
		}
		return sum
	}
	if with, without := lum(render(false)), lum(render(true)); with >= without {
		t.Errorf("shadowed render is not darker around the label: %d vs %d", with, without)
	}
}
