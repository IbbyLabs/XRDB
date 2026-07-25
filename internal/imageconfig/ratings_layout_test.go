package imageconfig

import (
	"encoding/json"
	"testing"
)

// A v2 config spells the split-side layout "left-right" and has a "top-bottom"
// layout of its own. Both used to normalise away to the default, which moved a
// migrated profile's ratings without reporting anything.
func TestParseAcceptsLegacyRatingsLayoutSpellings(t *testing.T) {
	cases := []struct {
		in   string
		want RatingsLayout
	}{
		{"left-right", LayoutSplitSide},
		{"leftright", LayoutSplitSide},
		{"left_right", LayoutSplitSide},
		{"split-side", LayoutSplitSide},
		{"top-bottom", LayoutTopBottom},
		{"topbottom", LayoutTopBottom},
		{"top_bottom", LayoutTopBottom},
		{"left", LayoutLeft},
		{"right", LayoutRight},
		{"top", LayoutTop},
		{"bottom", LayoutBottom},
		{"none", LayoutNone},
		{"LEFT-RIGHT", LayoutSplitSide},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			cfg := Parse(json.RawMessage(`{"ratingsLayout":"` + tc.in + `"}`))
			if cfg.RatingsLayout != tc.want {
				t.Errorf("ratingsLayout %q parsed to %q, want %q", tc.in, cfg.RatingsLayout, tc.want)
			}
		})
	}
}

// Every layout must key differently, or two profiles that look different share
// one cached image.
func TestRatingsLayoutsProduceDistinctCacheKeys(t *testing.T) {
	layouts := []RatingsLayout{
		LayoutTop, LayoutBottom, LayoutLeft, LayoutRight,
		LayoutSplitSide, LayoutTopBottom, LayoutNone,
	}
	seen := make(map[string]RatingsLayout, len(layouts))
	for _, l := range layouts {
		cfg := Default()
		cfg.RatingsLayout = l
		key := CacheKey(cfg)
		if prev, dup := seen[key]; dup {
			t.Errorf("layouts %q and %q share cache key %s", prev, l, key)
		}
		seen[key] = l
	}
}
