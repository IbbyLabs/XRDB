package compose

import (
	"image"
	"testing"
)

// A per-style vertical nudge must never push the rating row off the canvas.
// Before the clamp, a large ratingYOffsetSquare moved the row out of the image
// and the render returned 200 with the badges silently gone.
func TestClampStripYKeepsTheRowOnCanvas(t *testing.T) {
	bounds := image.Rect(0, 0, 600, 900)
	const edgeY, h = 24, 60
	lo, hi := edgeY, 900-edgeY-h // 24, 816

	cases := []struct {
		name string
		in   int
		want int
	}{
		{"in range unchanged", 300, 300},
		{"at top edge", lo, lo},
		{"at bottom edge", hi, hi},
		{"pushed past the bottom", 900, hi},
		{"pushed past the top", -900, lo},
		{"at the max offset value", 1200, hi},
		{"at the min offset value", -1200, lo},
	}
	for _, c := range cases {
		got := clampStripY(c.in, h, bounds, edgeY)
		if got != c.want {
			t.Errorf("%s: clampStripY(%d) = %d, want %d", c.name, c.in, got, c.want)
		}
		// Whatever the input, the drawn row stays on the canvas.
		if got < bounds.Min.Y || got+h > bounds.Max.Y {
			t.Errorf("%s: row [%d,%d] falls off the %dpx canvas", c.name, got, got+h, bounds.Max.Y)
		}
	}
}

// A row taller than the frame keeps its top visible rather than vanishing.
func TestClampStripYRowTallerThanFrameKeepsTopVisible(t *testing.T) {
	bounds := image.Rect(0, 0, 600, 900)
	if got := clampStripY(500, 1000, bounds, 24); got != 24 {
		t.Errorf("oversized row clamped to %d, want the top inset 24", got)
	}
}
