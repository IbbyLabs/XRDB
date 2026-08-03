package provider

import (
	"math"
	"testing"
)

// mdblistNormalize's default branch picks a scale from the value itself: over 10
// it divides, at or under 10 it does not. Every named case applies one fixed
// factor regardless of value, so comparing the factor at a low and a high input
// says whether a source reached a case of its own.
func mdblistScaleIsValueDependent(source string) bool {
	low, _ := mdblistNormalize(source, 8)
	high, _ := mdblistNormalize(source, 80)
	return math.Abs(high/80-low/8) > 0.0001
}

// A source normalizeMDBSource maps but mdblistNormalize has no case for still
// produces a rating, on whichever scale its own value implies. A percentage
// under 10 then renders ten times high and a 0-10 score over 10 renders ten
// times low, with no error either way — the shape that put every SIMKL rating
// at a tenth of its value.
func TestEverySourceMDBListMapsHasItsOwnScale(t *testing.T) {
	// The detector has to be able to fire, or a passing suite says nothing. An
	// unmapped source reaches the default branch by construction.
	if !mdblistScaleIsValueDependent("a-source-with-no-case") {
		t.Fatal("the fall-through detector does not detect fall-through; the rest of this test proves nothing")
	}

	sources := (&MDBList{}).RatingSources()
	if len(sources) < 10 {
		t.Fatalf("RatingSources returned %d sources; the loop below would check almost nothing", len(sources))
	}
	for _, source := range sources {
		if mdblistScaleIsValueDependent(source) {
			t.Errorf("mdblistNormalize has no case for %q, so its scale is guessed from the value", source)
		}
	}
}

// The scale a case applies is only right for the range the source actually
// sends. A percentage arriving as 0-10, or a 0-10 score arriving as 0-100,
// lands inside the badge either way.
func TestMDBListNormalizedValuesStayOnScale(t *testing.T) {
	full := map[string]float64{
		"imdb": 10, "metacriticuser": 10, "mal": 10, "anilist": 10,
		"tmdb": 100, "rt": 100, "rtaudience": 100, "metacritic": 100,
		"mdblist": 100, "trakt": 100, "commonsense": 100,
		"letterboxd": 5, "rogerebert": 4,
	}
	sources := (&MDBList{}).RatingSources()
	if len(sources) < 10 {
		t.Fatalf("RatingSources returned %d sources; the loop below would check almost nothing", len(sources))
	}
	for _, source := range sources {
		top, ok := full[source]
		if !ok {
			t.Errorf("%q has no declared full-scale value, so nobody has said what it sends", source)
			continue
		}
		got, _ := mdblistNormalize(source, top)
		if math.Abs(got-10) > 0.001 {
			t.Errorf("%q at its maximum %.0f normalized to %.2f, want 10", source, top, got)
		}
		if zero, _ := mdblistNormalize(source, 0); zero != 0 {
			t.Errorf("%q at 0 normalized to %.2f, want 0", source, zero)
		}
	}
}
