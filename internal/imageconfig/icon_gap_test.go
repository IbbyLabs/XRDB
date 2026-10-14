package imageconfig

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestRatingIconGapClamps(t *testing.T) {
	for _, tc := range []struct{ in, want int }{{0, 0}, {50, 50}, {900, 300}, {-5, 1}} {
		cfg := Parse(json.RawMessage(fmt.Sprintf(`{"ratingIconGap":%d}`, tc.in)))
		if cfg.RatingIconGap != tc.want {
			t.Errorf("ratingIconGap %d -> %d, want %d", tc.in, cfg.RatingIconGap, tc.want)
		}
	}
}
