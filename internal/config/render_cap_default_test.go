package config

import (
	"testing"
)

// A self-hosted owner is their own only caller, so a cap protects them from
// themselves — one person browsing a large library was turned away from their
// own box. Off unless the operator asks for it.
func TestTheRenderCapIsOffByDefault(t *testing.T) {
	t.Setenv("XRDB_RENDER_CAP_PER_MINUTE", "")
	if got := Load().RenderCapPerMinute; got != 0 {
		t.Errorf("render cap default is %d, want 0 (off)", got)
	}
}

// And the shared instance can still ask for one, which is the half that would
// otherwise regress in silence.
func TestAnOperatorCanStillSetTheRenderCap(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want int
	}{
		{"30", 30},
		{"1", 1},
		{"0", 0},
		{"not-a-number", 0}, // unreadable falls back to the default, not to a cap
		{"-5", 0},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			t.Setenv("XRDB_RENDER_CAP_PER_MINUTE", tc.raw)
			if got := Load().RenderCapPerMinute; got != tc.want {
				t.Errorf("XRDB_RENDER_CAP_PER_MINUTE=%q gave %d, want %d", tc.raw, got, tc.want)
			}
		})
	}
}
