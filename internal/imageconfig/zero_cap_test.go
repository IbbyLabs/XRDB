package imageconfig

import (
	"encoding/json"
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
