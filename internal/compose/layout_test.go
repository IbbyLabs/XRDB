package compose

import (
	"image"
	"testing"
)

func TestOccupancyPlaceNoCollision(t *testing.T) {
	o := newOccupancy(image.Rect(0, 0, 200, 300))
	got := o.place("br", 40, 20, 10, 10, 6)
	want := image.Rect(150, 270, 190, 290)
	if got != want {
		t.Errorf("place br = %v, want %v", got, want)
	}
}

func TestOccupancyPlaceStacksToAvoidOverlap(t *testing.T) {
	o := newOccupancy(image.Rect(0, 0, 200, 300))
	first := o.place("tr", 40, 20, 10, 10, 6)
	second := o.place("tr", 40, 20, 10, 10, 6)
	if first.Overlaps(second) {
		t.Fatalf("stacked boxes overlap: %v and %v", first, second)
	}
	if second.Min.Y < first.Max.Y {
		t.Errorf("second box did not stack below first: first=%v second=%v", first, second)
	}
	if gap := second.Min.Y - first.Max.Y; gap < 6 {
		t.Errorf("gap between stacked boxes = %d, want >= 6", gap)
	}
}

func TestOccupancyRingAvoidsReservedBadge(t *testing.T) {
	o := newOccupancy(image.Rect(0, 0, 200, 300))
	// Reserve an age badge in the bottom-right corner.
	age := o.place("br", 50, 24, 10, 10, 6)
	// A ring requesting the same corner must dodge the age badge.
	ring := o.place("br", 60, 60, 12, 12, 6)
	if age.Overlaps(ring) {
		t.Errorf("ring overlaps reserved age badge: age=%v ring=%v", age, ring)
	}
	if ring.Max.Y > age.Min.Y {
		t.Errorf("ring should float above the age badge: ring=%v age=%v", ring, age)
	}
}

func TestOccupancyReserveIgnoresEmpty(t *testing.T) {
	o := newOccupancy(image.Rect(0, 0, 100, 100))
	o.reserve(image.Rect(10, 10, 10, 10)) // empty (zero area)
	if len(o.rects) != 0 {
		t.Errorf("empty rect was reserved: %v", o.rects)
	}
}

func TestOccupancyNilSafe(t *testing.T) {
	var o *occupancy
	if o.overlaps(image.Rect(0, 0, 10, 10)) {
		t.Error("nil occupancy should report no overlap")
	}
	got := o.place("tl", 10, 10, 5, 5, 4)
	if got != image.Rect(5, 5, 15, 15) {
		t.Errorf("nil place anchored rect = %v, want (5,5)-(15,15)", got)
	}
	o.reserve(image.Rect(0, 0, 5, 5)) // must not panic
}
