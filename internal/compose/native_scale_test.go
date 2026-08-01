package compose

import (
	"testing"

	"xrdb_rewrite/internal/provider"
)

// A five-point score drawn bare reads as a poor ten-point one: Letterboxd's 4.2
// is a strong film sitting next to an IMDb 8.1 and looking like the weaker of
// the two.
func TestANativeFivePointScoreIsMarked(t *testing.T) {
	for _, source := range []string{"letterboxd", "allocine", "allocinepress"} {
		got := ratingBadgeValue(provider.Rating{Source: source, Value: 8.4, Label: "4.2"}, "native")
		if got != "4.2/5" {
			t.Errorf("%s: want 4.2/5, got %q", source, got)
		}
	}
	got := ratingBadgeValue(provider.Rating{Source: "rogerebert", Value: 8.75, Label: "3.5"}, "native")
	if got != "3.5/4" {
		t.Errorf("rogerebert: want 3.5/4, got %q", got)
	}
}

// Sources already on ten, and those whose label carries its own scale, are left
// alone.
func TestATenPointScoreIsNotMarked(t *testing.T) {
	cases := map[string]string{
		"imdb":           "8.1",
		"tmdb":           "7.6",
		"metacriticuser": "8.3",
		"mal":            "8.0",
		"rt":             "76%",
		"metacritic":     "76",
	}
	for source, label := range cases {
		if got := ratingBadgeValue(provider.Rating{Source: source, Label: label}, "native"); got != label {
			t.Errorf("%s: want %q unchanged, got %q", source, label, got)
		}
	}
}

// The normalized modes put every source on one scale, so a marker there would
// contradict the number it is attached to.
func TestTheNormalizedModesCarryNoScaleMarker(t *testing.T) {
	r := provider.Rating{Source: "letterboxd", Value: 8.4, Label: "4.2"}
	for _, mode := range []string{"normalized", "normalizedclean", "normalized100"} {
		got := ratingBadgeValue(r, mode)
		for _, marker := range []string{"/5", "/4"} {
			if len(got) >= 2 && got[len(got)-2:] == marker {
				t.Errorf("%s: want no scale marker, got %q", mode, got)
			}
		}
	}
}
