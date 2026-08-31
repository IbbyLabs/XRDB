package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// The suffix marks a five-point score so it is not read as a ten-point one, so
// dropping it is opt-in. The default column is the control: without it a
// function that never drew a suffix would satisfy the hidden column alone.
func TestHideNativeScaleDropsOnlyTheSuffix(t *testing.T) {
	for _, tc := range []struct {
		source string
		label  string
		shown  string
		hidden string
	}{
		{source: "letterboxd", label: "4.6", shown: "4.6/5", hidden: "4.6"},
		{source: "allocine", label: "3.9", shown: "3.9/5", hidden: "3.9"},
		{source: "rogerebert", label: "3.5", shown: "3.5/4", hidden: "3.5"},
		// Sources with no suffix are unaffected in both directions.
		{source: "imdb", label: "9.3", shown: "9.3", hidden: "9.3"},
		{source: "metacritic", label: "88/100", shown: "88/100", hidden: "88/100"},
	} {
		t.Run(tc.source, func(t *testing.T) {
			r := provider.Rating{Source: tc.source, Label: tc.label}
			if got := ratingBadgeValue(r, "native", false); got != tc.shown {
				t.Errorf("suffix shown: got %q, want %q", got, tc.shown)
			}
			if got := ratingBadgeValue(r, "native", true); got != tc.hidden {
				t.Errorf("suffix hidden: got %q, want %q", got, tc.hidden)
			}
		})
	}
}

// A normalized mode already drops the suffix because a shared scale needs no
// marking, so the flag must not change anything there.
func TestHideNativeScaleIsInertUnderNormalizedModes(t *testing.T) {
	r := provider.Rating{Source: "letterboxd", Value: 9.2, Label: "4.6"}
	for _, mode := range []string{"normalized", "normalizedclean", "normalized100"} {
		shown := ratingBadgeValue(r, mode, false)
		hidden := ratingBadgeValue(r, mode, true)
		if shown != hidden {
			t.Errorf("%s: flag changed the value, %q vs %q", mode, shown, hidden)
		}
		if shown == "" {
			t.Errorf("%s produced nothing, so the comparison above is vacuous", mode)
		}
	}
}

// The vote count still follows the value with the suffix gone.
func TestHideNativeScaleKeepsTheVoteCount(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingVoteCounts = true
	cfg.HideNativeScale = true
	r := provider.Rating{Source: "letterboxd", Label: "4.6", Votes: 12345}
	got := ratingBadgeLabel(r, cfg)
	if got == "4.6" {
		t.Fatal("the vote count was dropped along with the suffix")
	}
	if got[:3] != "4.6" || len(got) <= 3 {
		t.Errorf("got %q, want the value then a count", got)
	}
}
