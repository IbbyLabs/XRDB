package compose

import (
	"image/color"
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

// FR-224: the score text on rating badges takes its own colour, over the aggregate's.
func TestRatingValueColorOverridesTheStyle(t *testing.T) {
	cfg := imageconfig.Default()
	if got := chromeFor(cfg).valueColor; got != (color.NRGBA{R: 255, G: 255, B: 255, A: 255}) {
		t.Fatalf("default value colour = %v, want white", got)
	}
	cfg.AggregateValueColor = "#ff0000"
	cfg.RatingValueColor = "#102030"
	if got := chromeFor(cfg).valueColor; got != (color.NRGBA{R: 0x10, G: 0x20, B: 0x30, A: 255}) {
		t.Errorf("value colour = %v, want #102030", got)
	}
}
