package server

import (
	"testing"
	"time"

	"xrdb_rewrite/internal/compose"
)

// FR-234. A render held until an episode airs is capped below the default, and
// never kept longer than the default because no source set a lifetime.
func TestRenderTTLCapsAtFreshFor(t *testing.T) {
	def := 72 * time.Hour
	cases := []struct {
		name   string
		result *compose.Result
		want   time.Duration
	}{
		{"no sources, cap past the default", &compose.Result{FreshFor: 117 * time.Hour}, def},
		{"no sources, cap inside the default", &compose.Result{FreshFor: 6 * time.Hour}, 6 * time.Hour},
		{"a source's lifetime, longer cap", &compose.Result{RatingProviders: []string{"tmdb"}, FreshFor: 100 * time.Hour}, 24 * time.Hour},
		{"no cap", &compose.Result{}, def},
	}
	ttls := newTTLStore(map[string]time.Duration{"tmdb": 24 * time.Hour})
	for _, tc := range cases {
		if got := renderTTL(tc.result, ttls, "thumbnail", def); got != tc.want {
			t.Errorf("%s: renderTTL = %v, want %v", tc.name, got, tc.want)
		}
	}
}
