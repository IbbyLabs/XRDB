package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// On by default. Without the mark a missing rating reads as the provider being
// broken rather than one source being briefly held out, which is the confusion
// it exists to prevent.
func TestTheUnavailableMarkIsOnByDefault(t *testing.T) {
	if !imageconfig.Default().RatingUnavailableMark {
		t.Error("the default hides the mark; it should be shown unless asked otherwise")
	}
}

// A stored false has to survive the round trip. With `omitempty` it would drop
// out of the JSON and come back as the default, so turning it off would not
// stick.
func TestTurningTheMarkOffSurvivesARoundTrip(t *testing.T) {
	got := imageconfig.Parse([]byte(`{"ratingUnavailableMark":false}`))
	if got.RatingUnavailableMark {
		t.Error("an explicit false came back on")
	}
	// And an absent key keeps the default rather than reading as off.
	if !imageconfig.Parse([]byte(`{}`)).RatingUnavailableMark {
		t.Error("an unset config turned the mark off")
	}
}

// The two settings must produce different cache keys, or one user's choice is
// served from the other's render.
func TestTheMarkChangesTheCacheKey(t *testing.T) {
	on := imageconfig.Default()
	off := imageconfig.Default()
	off.RatingUnavailableMark = false
	if imageconfig.CacheKey(on) == imageconfig.CacheKey(off) {
		t.Error("both settings share a cache key")
	}
}
