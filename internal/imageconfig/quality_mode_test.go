package imageconfig

import (
	"slices"
	"testing"
)

func TestQualityBadgesModeParsesAndKeys(t *testing.T) {
	base := Parse([]byte(`{"badges":["4k","1080p","720p","cam"]}`))
	if !slices.Equal(base.Badges, []string{"4k", "1080p", "720p", "cam"}) {
		t.Fatalf("badges = %v, want the new tiers kept", base.Badges)
	}
	best := Parse([]byte(`{"badges":["4k","1080p","720p","cam"],"qualityBadgesMode":"BEST"}`))
	if best.QualityBadgesMode != "best" {
		t.Fatalf("mode = %q, want best", best.QualityBadgesMode)
	}
	if CacheKey(base) == CacheKey(best) {
		t.Fatal("qualityBadgesMode does not reach the cache key")
	}
	for _, raw := range []string{`"all"`, `"bogus"`} {
		cfg := Parse([]byte(`{"badges":["4k"],"qualityBadgesMode":` + raw + `}`))
		if cfg.QualityBadgesMode != "" {
			t.Errorf("mode %s = %q, want empty", raw, cfg.QualityBadgesMode)
		}
	}
}
