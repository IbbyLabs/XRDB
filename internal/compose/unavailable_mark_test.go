package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

func TestTheUnavailableMarkIsOffByDefault(t *testing.T) {
	if imageconfig.Default().RatingUnavailableMark {
		t.Error("the default draws the mark; it should only be drawn when asked for")
	}
}

// A stored true has to survive the round trip, and an absent key keeps the
// default.
func TestTurningTheMarkOnSurvivesARoundTrip(t *testing.T) {
	if !imageconfig.Parse([]byte(`{"ratingUnavailableMark":true}`)).RatingUnavailableMark {
		t.Error("an explicit true came back off")
	}
	if imageconfig.Parse([]byte(`{}`)).RatingUnavailableMark {
		t.Error("an unset config turned the mark on")
	}
}

// The two settings must produce different cache keys, or one user's choice is
// served from the other's render.
func TestTheMarkChangesTheCacheKey(t *testing.T) {
	off := imageconfig.Default()
	on := imageconfig.Default()
	on.RatingUnavailableMark = true
	if imageconfig.CacheKey(on) == imageconfig.CacheKey(off) {
		t.Error("both settings share a cache key")
	}
}
