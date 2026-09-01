package server

import (
	"testing"
	"time"

	"xrdb_rewrite/internal/compose"
)

func surfaceStore(t *testing.T, surfaces map[string]time.Duration) *ttlStore {
	t.Helper()
	s := newTTLStore(map[string]time.Duration{"mal": 6 * time.Hour})
	s.setSurfaces(surfaces)
	return s
}

// A surface set on its own replaces the minimum rather than capping it, so a
// thumbnail can be kept longer than its rating sources would allow as well as
// shorter. Both directions, because a cap would satisfy only one of them.
func TestASurfaceTTLReplacesTheProviderMinimum(t *testing.T) {
	for _, tc := range []struct {
		name    string
		surface string
		set     time.Duration
		want    time.Duration
	}{
		{name: "longer than the sources", surface: "thumbnail", set: 48 * time.Hour, want: 48 * time.Hour},
		{name: "shorter than the sources", surface: "thumbnail", set: time.Hour, want: time.Hour},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ttls := surfaceStore(t, map[string]time.Duration{tc.surface: tc.set})
			result := &compose.Result{RatingProviders: []string{"mal"}}

			if got := effectiveTTL(result, ttls, tc.surface); got != tc.want {
				t.Errorf("effectiveTTL = %s, want %s", got, tc.want)
			}
		})
	}
}

// Without this control the test above would pass on a build that applied one
// surface's number to every render.
func TestASurfaceWithNoTTLKeepsTheProviderMinimum(t *testing.T) {
	ttls := surfaceStore(t, map[string]time.Duration{"thumbnail": 48 * time.Hour})
	result := &compose.Result{RatingProviders: []string{"mal"}}

	if got := effectiveTTL(result, ttls, "poster"); got != 6*time.Hour {
		t.Errorf("effectiveTTL = %s, want the 6h provider minimum", got)
	}
}

// A render that lost a badge is short-lived whatever surface it is, or a long
// thumbnail TTL would pin a degraded thumbnail for two days.
func TestADegradedRenderIsStillCappedOnASurfaceWithItsOwnTTL(t *testing.T) {
	ttls := surfaceStore(t, map[string]time.Duration{"thumbnail": 48 * time.Hour})
	ttls.degraded = 5 * time.Minute
	result := &compose.Result{RatingProviders: []string{"mal"}, Degraded: true}

	if got := effectiveTTL(result, ttls, "thumbnail"); got != 5*time.Minute {
		t.Errorf("effectiveTTL = %s, want the 5m degraded cap", got)
	}
}
