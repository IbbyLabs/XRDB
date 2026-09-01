package server

import (
	"testing"
	"time"

	"xrdb_rewrite/internal/compose"
)

func degradedStore(capTTL time.Duration, seed map[string]time.Duration) *ttlStore {
	s := newTTLStore(seed)
	s.setDegradedTTL(capTTL)
	return s
}

// Renders are cached for days. A source held out on rate-limit grounds would
// otherwise freeze its missing badge into a catalogue for that whole window.
func TestDegradedRenderTakesTheShortTTL(t *testing.T) {
	result := &compose.Result{RatingProviders: []string{"tmdb"}, Degraded: true}
	ttls := degradedStore(20*time.Minute, map[string]time.Duration{"tmdb": 72 * time.Hour})

	if got := effectiveTTL(result, ttls); got != 20*time.Minute {
		t.Errorf("effectiveTTL = %v, want 20m", got)
	}
}

// The default TTL is the cache's own, reached by returning zero. A degraded
// render has to name a duration instead, or it inherits the long one.
func TestDegradedRenderWithNoProviderTTLStillCapped(t *testing.T) {
	result := &compose.Result{RatingProviders: []string{"tmdb"}, Degraded: true}
	ttls := degradedStore(20*time.Minute, nil)

	if got := effectiveTTL(result, ttls); got != 20*time.Minute {
		t.Errorf("effectiveTTL = %v, want 20m", got)
	}
}

func TestWholeRenderKeepsItsNormalTTL(t *testing.T) {
	result := &compose.Result{RatingProviders: []string{"tmdb"}}
	ttls := degradedStore(20*time.Minute, map[string]time.Duration{"tmdb": 72 * time.Hour})

	if got := effectiveTTL(result, ttls); got != 72*time.Hour {
		t.Errorf("effectiveTTL = %v, want 72h", got)
	}
}

// A provider TTL below the cap is already short enough.
func TestDegradedRenderKeepsAShorterProviderTTL(t *testing.T) {
	result := &compose.Result{RatingProviders: []string{"mdblist"}, Degraded: true}
	ttls := degradedStore(20*time.Minute, map[string]time.Duration{"mdblist": 5 * time.Minute})

	if got := effectiveTTL(result, ttls); got != 5*time.Minute {
		t.Errorf("effectiveTTL = %v, want 5m", got)
	}
}

// Zero turns the cap off, leaving degraded renders on the normal TTL.
func TestDegradedCapOfZeroChangesNothing(t *testing.T) {
	result := &compose.Result{RatingProviders: []string{"tmdb"}, Degraded: true}
	ttls := degradedStore(0, map[string]time.Duration{"tmdb": 72 * time.Hour})

	if got := effectiveTTL(result, ttls); got != 72*time.Hour {
		t.Errorf("effectiveTTL = %v, want 72h", got)
	}
}
