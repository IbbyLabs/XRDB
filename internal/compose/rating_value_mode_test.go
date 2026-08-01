package compose

import (
	"testing"

	"xrdb_rewrite/internal/provider"
)

// Every provider reports a score normalized to ten alongside a label on its own
// native scale, so these cover both halves of that pair.
func valueModeRatings() []provider.Rating {
	return []provider.Rating{
		{Source: "letterboxd", Value: 6.8, Label: "3.4"},  // 0-5 scale
		{Source: "rogerebert", Value: 8.75, Label: "3.5"}, // 0-4 scale
		{Source: "rt", Value: 8.2, Label: "82%"},          // percentage
		{Source: "imdb", Value: 8.0, Label: "8.0"},        // already out of ten
	}
}

func TestNativeModeKeepsEverySourceOnItsOwnScale(t *testing.T) {
	want := map[string]string{
		"letterboxd": "3.4/5",
		"rogerebert": "3.5/4",
		"rt":         "82%",
		"imdb":       "8.0",
	}
	for _, mode := range []string{"", "native"} {
		for _, r := range valueModeRatings() {
			if got := ratingBadgeValue(r, mode); got != want[r.Source] {
				t.Errorf("mode %q: %s = %q, want %q", mode, r.Source, got, want[r.Source])
			}
		}
	}
}

func TestNormalizedModesPutEverySourceOnOneScale(t *testing.T) {
	cases := []struct {
		mode string
		want map[string]string
	}{
		{"normalized", map[string]string{
			"letterboxd": "6.8", "rogerebert": "8.8", "rt": "8.2", "imdb": "8.0",
		}},
		{"normalizedclean", map[string]string{
			"letterboxd": "6.8", "rogerebert": "8.8", "rt": "8.2", "imdb": "8",
		}},
		{"normalized100", map[string]string{
			"letterboxd": "68", "rogerebert": "88", "rt": "82", "imdb": "80",
		}},
	}
	for _, tc := range cases {
		for _, r := range valueModeRatings() {
			if got := ratingBadgeValue(r, tc.mode); got != tc.want[r.Source] {
				t.Errorf("mode %q: %s = %q, want %q", tc.mode, r.Source, got, tc.want[r.Source])
			}
		}
	}
}

func TestAHundredPointValueStaysWithinItsScale(t *testing.T) {
	if got := formatRatingValue(-1, "normalized100"); got != "0" {
		t.Errorf("negative score = %q, want 0", got)
	}
	if got := formatRatingValue(12, "normalized100"); got != "100" {
		t.Errorf("over-range score = %q, want 100", got)
	}
}

// A combined score is already on the ten-point scale, so only the clean and
// hundred-point modes change how it reads.
func TestACombinedScoreFollowsTheSameMode(t *testing.T) {
	want := map[string]string{
		"":                "7.0",
		"native":          "7.0",
		"normalized":      "7.0",
		"normalizedclean": "7",
		"normalized100":   "70",
	}
	for mode, expected := range want {
		if got := formatRatingValue(7, mode); got != expected {
			t.Errorf("mode %q: combined score = %q, want %q", mode, got, expected)
		}
	}
}
