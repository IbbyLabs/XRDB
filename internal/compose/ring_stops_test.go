package compose

import (
	"image/color"
	"testing"
)

// The stops already drive the aggregate pill. The ring ignored them entirely, so
// a configured palette showed on the pill and the built-in bands on the ring
// beside it (FR-166).
func TestTheRingFollowsTheConfiguredStops(t *testing.T) {
	// 0-100 scale: 8.0 out of 10 lands at 80, inside the top stop.
	stops := "0:#000080,50:#008000,80:#ff00ff"

	got := ratingRingFillColor(8.0, "", stops)
	want := color.NRGBA{R: 255, G: 0, B: 255, A: 255}
	if got != want {
		t.Errorf("with stops set the ring drew %v, want %v", got, want)
	}
}

// Anyone who never set stops must render exactly as before, which is what makes
// this safe to turn on for everyone rather than needing a new mode.
func TestNoStopsLeavesTheBuiltInBandsUntouched(t *testing.T) {
	for _, tc := range []struct {
		avg  float64
		want color.NRGBA
	}{
		{9.0, color.NRGBA{R: 22, G: 163, B: 74, A: 255}},
		{8.0, color.NRGBA{R: 132, G: 204, B: 22, A: 255}},
		{6.5, color.NRGBA{R: 245, G: 158, B: 11, A: 255}},
		{5.0, color.NRGBA{R: 220, G: 38, B: 38, A: 255}},
		{2.0, color.NRGBA{R: 127, G: 29, B: 29, A: 255}},
	} {
		if got := ratingRingFillColor(tc.avg, "", ""); got != tc.want {
			t.Errorf("avg %.1f with no stops drew %v, want the band %v", tc.avg, got, tc.want)
		}
	}
}

// An explicit ring colour is the most specific instruction and still wins.
func TestAnExplicitRingColourOutranksTheStops(t *testing.T) {
	got := ratingRingFillColor(8.0, "#123456", "0:#000080,80:#ff00ff")
	want := color.NRGBA{R: 0x12, G: 0x34, B: 0x56, A: 255}
	if got != want {
		t.Errorf("explicit hex drew %v, want %v", got, want)
	}
}
