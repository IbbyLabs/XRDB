package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

func TestPerStyleOffsetsAddToTheStripOffset(t *testing.T) {
	cfg := imageconfig.Config{}
	cfg.RatingBadgeOffsetX = 5
	cfg.RatingBadgeOffsetY = 3
	cfg.RatingOffsetXPillGlass = 10
	cfg.RatingOffsetYPillGlass = 20
	cfg.RatingOffsetXSquare = -4
	cfg.RatingOffsetYSquare = -8

	cfg.BadgeStyle = imageconfig.BadgeGlass
	if x, y := ratingStripOffsets(cfg); x != 15 || y != 23 {
		t.Errorf("glass offsets = (%d, %d), want (15, 23)", x, y)
	}

	cfg.BadgeStyle = imageconfig.BadgePill
	if x, y := ratingStripOffsets(cfg); x != 15 || y != 23 {
		t.Errorf("pill shares the glass nudge: (%d, %d), want (15, 23)", x, y)
	}

	cfg.BadgeStyle = imageconfig.BadgeSquare
	if x, y := ratingStripOffsets(cfg); x != 1 || y != -5 {
		t.Errorf("square offsets = (%d, %d), want (1, -5)", x, y)
	}
}
