package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// Locks the native mode to drawing the label verbatim. This is a behaviour
// lock, not a regression test: it starts from a Rating that already carries a
// label, so it passes on a build where the provider supplies none. The
// regression for that lives in provider.TestWikidataKeepsTheDisplayStringForTheBadge,
// which runs a fetch.
//
// What it does guard is the other half of the chain — a future change that
// stops the native mode reading Label would draw N/A again with every provider
// supplying one.
func TestTheNativeModeDrawsTheLabelVerbatim(t *testing.T) {
	cfg := imageconfig.Config{}

	for _, tc := range []struct {
		name   string
		rating provider.Rating
		want   string
	}{
		{
			name:   "a percentage from wikidata",
			rating: provider.Rating{Source: "rt", Value: 9.1, Label: "91%"},
			want:   "91%",
		},
		{
			name:   "an n-of-100 score from wikidata",
			rating: provider.Rating{Source: "metacritic", Value: 8.1, Label: "81/100"},
			want:   "81/100",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := ratingBadgeLabel(tc.rating, cfg)
			if got != tc.want {
				t.Errorf("badge text = %q, want %q", got, tc.want)
			}
			if got == "" {
				t.Error("an empty label is replaced with N/A on the poster")
			}
		})
	}
}

// The control: the normalized modes format the value and never read the label,
// which is why they kept working throughout BUG-281 and why the workaround was
// to switch to one. Without this, the test above would pass on a build that had
// quietly moved every mode onto the value.
func TestANormalizedBadgeIgnoresTheLabel(t *testing.T) {
	cfg := imageconfig.Config{}
	cfg.RatingValueMode = "normalized"
	r := provider.Rating{Source: "metacritic", Value: 8.1, Label: "81/100"}

	if got := ratingBadgeLabel(r, cfg); got == "81/100" {
		t.Errorf("badge text = %q, want the formatted value rather than the label", got)
	}
}
