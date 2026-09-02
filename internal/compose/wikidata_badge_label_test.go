package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// The default value mode draws the label, so a supplier that reports a value
// without one puts N/A on the poster. Asserts the drawn text rather than the
// Label field: the field could be set and the badge still not read it, and the
// text is what the report was about.
func TestABadgeDrawsTheNativeScoreRatherThanNA(t *testing.T) {
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
// which is why they kept working throughout and why the workaround was to
// switch to one. Without this, the test above would pass on a build that had
// quietly moved every mode onto the value.
func TestANormalizedBadgeIgnoresTheLabel(t *testing.T) {
	cfg := imageconfig.Config{}
	cfg.RatingValueMode = "normalized"
	r := provider.Rating{Source: "metacritic", Value: 8.1, Label: "81/100"}

	if got := ratingBadgeLabel(r, cfg); got == "81/100" {
		t.Errorf("badge text = %q, want the formatted value rather than the label", got)
	}
}
