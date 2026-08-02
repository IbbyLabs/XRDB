package compose

import (
	"image"
	"testing"
)

// A badge with a manual offset is drawn at the offset position. If the
// occupancy map records the un-offset anchor instead, a second badge sharing
// the corner is placed as though the first were somewhere it is not, and the
// two overlap. placeNudged reserves where the badge actually lands.
func TestAnOffsetBadgeReservesWhereItIsDrawn(t *testing.T) {
	frame := image.Rect(0, 0, 600, 900)

	// The old shape: place reserves the anchor, the caller offsets afterward.
	// A second badge at the same corner is then free to land on the first.
	old := newOccupancy(frame)
	first := old.place("br", 120, 60, 12, 12, 7)
	drawn := first.Add(image.Pt(-80, -40)) // where it is actually drawn
	second := old.place("br", 120, 60, 12, 12, 7)
	if !second.Overlaps(drawn) {
		t.Fatal("test does not reproduce the defect: the second badge already clears the drawn position")
	}

	// placeNudged reserves the drawn rectangle, so the second badge avoids it.
	fixed := newOccupancy(frame)
	nudged := fixed.placeNudged("br", 120, 60, 12, 12, 7, -80, -40)
	if nudged != drawn {
		t.Errorf("placeNudged landed at %v, expected the drawn rect %v", nudged, drawn)
	}
	after := fixed.place("br", 120, 60, 12, 12, 7)
	if after.Overlaps(nudged) {
		t.Errorf("a badge placed after the nudged one overlaps it at %v vs %v", after, nudged)
	}
}

// A large offset used to draw a badge off the poster. keepInside pulls it back.
func TestANudgedBadgeStaysInsideTheFrame(t *testing.T) {
	frame := image.Rect(0, 0, 600, 900)
	occ := newOccupancy(frame)
	r := occ.placeNudged("br", 120, 60, 12, 12, 7, 400, 400)
	if !r.In(frame) {
		t.Errorf("a nudged badge left the frame: %v not inside %v", r, frame)
	}
}
