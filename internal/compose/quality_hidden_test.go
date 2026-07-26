package compose

import (
	"encoding/json"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// Hiding the badges has to leave the selection alone, so switching them back on
// does not mean picking every badge again.
func TestHidingQualityBadgesKeepsTheSelection(t *testing.T) {
	cfg := imageconfig.Parse(json.RawMessage(
		`{"badges":["4k","hdr","atmos"],"qualityBadgesHidden":true}`))

	if !cfg.QualityBadgesHidden {
		t.Error("qualityBadgesHidden did not parse")
	}
	if len(cfg.Badges) != 3 {
		t.Errorf("Badges = %v, want the three that were picked", cfg.Badges)
	}
	if showQualityBadges(cfg) {
		t.Error("a hidden row must not be drawn")
	}
}

func TestQualityBadgesAreShownByDefault(t *testing.T) {
	cfg := imageconfig.Parse(json.RawMessage(`{"badges":["4k"]}`))
	if cfg.QualityBadgesHidden {
		t.Error("badges must be drawn unless the config hides them")
	}
	if !showQualityBadges(cfg) {
		t.Error("a picked badge should be drawn")
	}
}

func TestNoBadgesPickedDrawsNothing(t *testing.T) {
	cfg := imageconfig.Parse(json.RawMessage(`{"badges":[]}`))
	if showQualityBadges(cfg) {
		t.Error("nothing picked means nothing to draw")
	}
}
