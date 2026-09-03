package server

import (
	"testing"
	"time"

	"xrdb_rewrite/internal/compose"
)

// The artwork source is shared across every render that uses it, so its TTL is
// not the render's ceiling.
func TestArtworkSourceDoesNotFloorTheTTL(t *testing.T) {
	result := &compose.Result{
		RatingProviders: []string{"mal"},
	}
	ttls := newTTLStore(map[string]time.Duration{
		"tmdb": time.Hour,
		"mal":  30 * 24 * time.Hour,
	})

	if got := effectiveTTL(result, ttls, "poster"); got != 30*24*time.Hour {
		t.Errorf("effectiveTTL = %v, want 720h", got)
	}
}

// A source supplying artwork and ratings both is counted for its ratings.
func TestArtworkSourceInTheRatingsListStillFloors(t *testing.T) {
	result := &compose.Result{
		RatingProviders: []string{"tmdb", "mal"},
	}
	ttls := newTTLStore(map[string]time.Duration{
		"tmdb": time.Hour,
		"mal":  30 * 24 * time.Hour,
	})

	if got := effectiveTTL(result, ttls, "poster"); got != time.Hour {
		t.Errorf("effectiveTTL = %v, want 1h", got)
	}
}
