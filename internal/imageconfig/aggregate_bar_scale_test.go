package imageconfig

import (
	"encoding/json"
	"testing"
)

// The bar height is a percent of the default, so 0 has to mean 100 rather than
// a bar of no height. The clamp is the only bound the drawing code has left, so
// what it refuses is what the renderer never sees.
func TestAggregateBarScaleClamp(t *testing.T) {
	for _, tc := range []struct {
		in   int
		want int
	}{
		{in: 150, want: 150},
		{in: 25, want: 25},
		{in: 400, want: 400},
		// Out of range is pulled to the bound rather than refused, matching the
		// offset beside it.
		{in: 1, want: 25},
		{in: 10000, want: 400},
		{in: -50, want: 25},
		// Zero is the unset value everywhere else in this config.
		{in: 0, want: 0},
	} {
		raw, err := json.Marshal(map[string]int{"aggregateBarScale": tc.in})
		if err != nil {
			t.Fatalf("marshalling the probe config: %v", err)
		}
		if got := Parse(json.RawMessage(raw)).AggregateBarScale; got != tc.want {
			t.Errorf("aggregateBarScale %d parsed as %d, want %d", tc.in, got, tc.want)
		}
	}
}

// It is in the render cache key, so two thicknesses cannot share an image.
func TestAggregateBarScaleReachesTheCacheKey(t *testing.T) {
	a, b := Default(), Default()
	a.AggregateBarScale = 150
	b.AggregateBarScale = 300
	if CacheKey(a) == CacheKey(b) {
		t.Fatal("two bar thicknesses share a cache key")
	}
	if CacheKey(a) == CacheKey(Default()) {
		t.Error("a scaled bar shares the key with the default")
	}
}
