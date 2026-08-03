package compose

import (
	"image"
	"testing"
)

// The genre trim measures freeWidthAt at the row the badge occupies, which is the
// anchor row plus its vertical nudge. Before BUG-197 the nudge was ignored, so a
// genre strip pushed by genreBadgeOffsetY into the ring's row was measured against
// the empty anchor row, approved at full width, and drawn straight over the ring
// instead of shortening. This asserts the measurement sees the ring once the nudge
// lands the row on it — a width property, not a coordinate.
func TestFreeWidthAtMeasuresTheNudgedRow(t *testing.T) {
	occ := newOccupancy(image.Rect(0, 0, 600, 900))
	// A rating ring holds the top-right, lowered into the offset row rather than
	// the top row the strip anchors to.
	const ringLeft = 450
	occ.reserve(image.Rect(ringLeft, 155, 580, 215))

	const h, edgeX, edgeY, gap = 60, 24, 24, 7
	full := 600 - edgeX*2

	// No vertical nudge: the anchor row is clear of the ring, so full width.
	if w := occ.freeWidthAt("tl", h, edgeX, edgeY, gap, 0); w != full {
		t.Errorf("unoffset top row should be full width %d, got %d", full, w)
	}

	// Nudged into the ring's row: the measurement must see the ring and narrow,
	// which is what forces the label to shorten rather than overrun the ring.
	nudged := occ.freeWidthAt("tl", h, edgeX, edgeY, gap, 155)
	if nudged >= full {
		t.Fatalf("a nudge into the ring's row must narrow the free width, got %d (full)", nudged)
	}
	if want := (ringLeft - gap) - edgeX; nudged != want {
		t.Errorf("free width in the ring's row = %d, want %d (up to the ring's left)", nudged, want)
	}
}
