package imageconfig

import (
	"encoding/json"
	"testing"
)

// 0 already means unset, so an invisible centre needs a value of its own. The
// badge border spells the same thing as -1.
func TestTheRingCentreCanBeMadeInvisible(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want int
	}{
		{"invisible", `{"ringCenterOpacity":-1}`, -1},
		{"unset keeps the default", `{"ringCenterOpacity":0}`, 0},
		{"an ordinary opacity", `{"ringCenterOpacity":40}`, 40},
		{"below invisible is clamped to it", `{"ringCenterOpacity":-9}`, -1},
		{"above full is clamped", `{"ringCenterOpacity":900}`, 100},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := ParseSurface(json.RawMessage(tc.raw), "poster")
			if cfg.RingCenterOpacity != tc.want {
				t.Errorf("RingCenterOpacity = %d, want %d", cfg.RingCenterOpacity, tc.want)
			}
		})
	}
}
