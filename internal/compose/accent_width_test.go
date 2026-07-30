package compose

import (
	"image"
	"image/color"
	"testing"
)

// The score pill's accent outline was stroked at a fixed 2px. Asking for a
// thicker one is the whole of FR-59, so the width has to actually change how
// much is painted.
func TestAccentOutlineWidthChangesWhatIsDrawn(t *testing.T) {
	paint := func(width int) int {
		dst := image.NewNRGBA(image.Rect(0, 0, 120, 60))
		w := 2
		if width > 0 {
			w = width
		}
		strokeRoundedRect(dst, image.Rect(10, 10, 110, 50), 20, w, color.NRGBA{R: 255, G: 0, B: 0, A: 255})
		return paintedPixels(dst)
	}

	thin := paint(0) // default
	thick := paint(6)
	if thick <= thin {
		t.Errorf("a 6px outline painted %d pixels, want more than the default %d", thick, thin)
	}
	if paint(2) != thin {
		t.Error("an explicit 2 should match the default")
	}
}
