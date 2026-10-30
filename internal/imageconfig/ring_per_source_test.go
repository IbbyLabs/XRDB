package imageconfig

import "testing"

func TestRingPerSourceAndLogoPositionParse(t *testing.T) {
	cfg := Parse([]byte(`{"ringPerSource":true,"ringLogoPosition":"Above"}`))
	if !cfg.RingPerSource || cfg.RingLogoPosition != "above" {
		t.Errorf("got perSource=%v logo=%q", cfg.RingPerSource, cfg.RingLogoPosition)
	}
	cfg = Parse([]byte(`{"ringLogoPosition":"sideways"}`))
	if cfg.RingPerSource || cfg.RingLogoPosition != "" {
		t.Errorf("unknown position kept: perSource=%v logo=%q", cfg.RingPerSource, cfg.RingLogoPosition)
	}
}
