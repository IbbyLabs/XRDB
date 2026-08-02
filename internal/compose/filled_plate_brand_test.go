package compose

import "testing"

// Filling the mark's plate used to take a brand mark off the colour path and
// tint it to one ink, flattening a multi-colour mark (Letterboxd's three dots,
// IMDb's black-on-yellow) to a solid disc (BUG-193). A brand-coloured mark now
// keeps its colours whether or not the plate is filled; only a greyscale
// silhouette, which has no colour to lose, is still tinted to contrast.
func TestABrandMarkKeepsItsColoursOnAFilledPlate(t *testing.T) {
	if !brandColoursSurvive(true, true) {
		t.Error("a brand-coloured mark is tinted to one ink on a filled plate, flattening it (BUG-193)")
	}
	if !brandColoursSurvive(true, false) {
		t.Error("a brand-coloured mark should keep its colours on an unfilled plate too")
	}
	if brandColoursSurvive(false, true) {
		t.Error("a greyscale silhouette has no brand colour and should still tint to contrast a filled plate")
	}
	if brandColoursSurvive(false, false) {
		t.Error("a greyscale silhouette should still tint on an unfilled plate")
	}
}
