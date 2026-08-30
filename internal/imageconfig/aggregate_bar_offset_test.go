package imageconfig

import (
	"encoding/json"
	"testing"
)

// The bar's nudge matches RingOffsetX/Y, the other per-element offset parsed a
// few lines above it.
func TestAggregateBarOffsetRange(t *testing.T) {
	for _, tc := range []struct {
		in   int
		want int
	}{
		{in: 60, want: 60},
		{in: 1200, want: 1200},
		{in: 1201, want: 1200},
		{in: -1200, want: -1200},
		{in: -1201, want: -1200},
	} {
		raw, err := json.Marshal(map[string]int{"aggregateBarOffset": tc.in})
		if err != nil {
			t.Fatalf("marshalling the probe config: %v", err)
		}
		cfg := Parse(json.RawMessage(raw))
		if cfg.AggregateBarOffset != tc.want {
			t.Errorf("aggregateBarOffset %d parsed as %d, want %d", tc.in, cfg.AggregateBarOffset, tc.want)
		}
	}
}
