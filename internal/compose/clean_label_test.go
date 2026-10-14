package compose

import (
	"image"
	"testing"
)

// FR-213: the clean genre label is a grotesque bold at v2's 20px, slightly translucent.
func TestCleanLabelMatchesV2(t *testing.T) {
	ensureFaces()
	face := cleanLabelFaceFor(1)
	if face == labelFaceFor(1.2) {
		t.Fatal("clean label fell back to the tiled label face")
	}
	if got := face.Metrics().Height.Ceil(); got < 20 || got > 25 {
		t.Errorf("clean label line height = %dpx, want about 23 for a 20px face", got)
	}

	img := image.NewNRGBA(image.Rect(0, 0, 400, 120))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i+3] = 255
	}
	drawGenreBadge(img, []string{"Anime"}, "tc", 1, newOccupancy(img.Bounds()), genreBadgeOpts{style: "clean", maxGenres: 1})
	brightest := uint8(0)
	for y := 0; y < 120; y++ {
		for x := 0; x < 400; x++ {
			if c := img.NRGBAAt(x, y); c.R > brightest {
				brightest = c.R
			}
		}
	}
	// The default label ink is 225 grey.
	if want := uint8(225 * cleanLabelAlpha / 255); brightest < want-2 || brightest > want+2 {
		t.Errorf("label peak on black = %d, want about %d (225 grey at %d alpha)", brightest, want, cleanLabelAlpha)
	}
}

// The clean label grows with the frame the way v2's did, not with the badge tier.
func TestCleanLabelScalesWithTheFrame(t *testing.T) {
	if got := cleanLabelScale(image.Rect(0, 0, 580, 859), 0); got != 1 {
		t.Errorf("580px poster scale = %v, want 1", got)
	}
	if got := cleanLabelScale(image.Rect(0, 0, 1280, 1896), 0); got < 2.25 || got > 2.35 {
		t.Errorf("1280px poster scale = %v, want about 2.3", got)
	}
	if got := cleanLabelScale(image.Rect(0, 0, 580, 859), 150); got != 1.5 {
		t.Errorf("150%% on a 580px poster = %v, want 1.5", got)
	}
}
