package compose

import (
	"testing"

	"xrdb_rewrite/internal/provider"
)

// Letterboxd scores out of five, so its own label reads as a low number beside
// IMDb's out of ten. Native mode marks the scale; the normalized mode puts
// every source on one scale instead.
func TestLetterboxdDisplayScale(t *testing.T) {
	r := provider.Rating{Source: "letterboxd", Value: 7.6, Label: "3.8"}
	if got := ratingBadgeValue(r, ""); got != "3.8/5" {
		t.Errorf("native mode = %q, want the marked 3.8/5", got)
	}
	if got := ratingBadgeValue(r, "normalized"); got != "7.6" {
		t.Errorf("normalized mode = %q, want 7.6", got)
	}
}
