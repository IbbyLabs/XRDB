package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// FR-221: the space between rating badges is configurable.
func TestBadgeGapWidensTheRow(t *testing.T) {
	ensureFaces()
	ensureIcons()
	three := []provider.Rating{{Source: "imdb", Label: "8.8"}, {Source: "tmdb", Label: "8.4"}, {Source: "rt", Label: "87%"}}
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb", "rt"}

	base := singleRowWidthAt(1, three, cfg, titleFacts{})
	cfg.RatingBadgeGap = 300
	wide := singleRowWidthAt(1, three, cfg, titleFacts{})
	if want := base + 2*22; wide != want {
		t.Errorf("row at 300%% gap is %dpx, want %dpx (default %dpx plus two gaps of 22px)", wide, want, base)
	}
	if d := ratingStripDimsFor(1, cfg); d.rowGap != 33 {
		t.Errorf("row gap at 300%% = %d, want 33", d.rowGap)
	}
}
