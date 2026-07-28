package imageconfig

import (
	"encoding/json"
	"strings"
	"testing"
)

// The configurator sends 0 to mean "no cap", and every saved profile carries
// it. Treating that as a cap of zero silently removes every badge from the
// render, which is indistinguishable from the feature being broken.
func TestAZeroCapMeansNoCap(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"ratingsMax":0,"qualityBadgesMax":0}`))

	if cfg.RatingsMax != nil {
		t.Errorf("RatingsMax = %d, want nil (no cap)", *cfg.RatingsMax)
	}
	if cfg.QualityBadgesMax != nil {
		t.Errorf("QualityBadgesMax = %d, want nil (no cap)", *cfg.QualityBadgesMax)
	}
}

func TestARealCapIsKept(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"ratingsMax":3,"qualityBadgesMax":2}`))

	if cfg.RatingsMax == nil || *cfg.RatingsMax != 3 {
		t.Errorf("RatingsMax = %v, want 3", cfg.RatingsMax)
	}
	if cfg.QualityBadgesMax == nil || *cfg.QualityBadgesMax != 2 {
		t.Errorf("QualityBadgesMax = %v, want 2", cfg.QualityBadgesMax)
	}
}

// Negative values were already rejected; keep it that way.
func TestANegativeCapIsIgnored(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"ratingsMax":-4,"qualityBadgesMax":-1}`))

	if cfg.RatingsMax != nil {
		t.Errorf("RatingsMax = %d, want nil", *cfg.RatingsMax)
	}
	if cfg.QualityBadgesMax != nil {
		t.Errorf("QualityBadgesMax = %d, want nil", *cfg.QualityBadgesMax)
	}
}

// The availability check changes what is drawn, so it has to change the cache
// key. It is also omitempty, so a config that never sets it hashes exactly as
// it did before the field existed rather than orphaning every cached render.
func TestAvailabilityCheckKeysSeparately(t *testing.T) {
	base := Default()
	base.Badges = []string{"4k", "hdr"}
	withDetect := base
	withDetect.QualityBadgesDetect = true

	if CacheKey(base) == CacheKey(withDetect) {
		t.Error("the availability check does not change the cache key")
	}

	encoded, err := json.Marshal(base.QualityBadgeConfig)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if strings.Contains(string(encoded), "qualityBadgesDetect") {
		t.Errorf("an unset availability check still serialises: %s", encoded)
	}
}
