package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// BUG-292: a single row of eight badges on a poster overflowed the right edge.
func TestSingleRowStripFitsThePoster(t *testing.T) {
	ensureFaces()
	ensureIcons()
	eight := []provider.Rating{
		{Source: "imdb", Label: "8.8"}, {Source: "tmdb", Label: "8.4"},
		{Source: "rt", Label: "87%"}, {Source: "metacritic", Label: "74"},
		{Source: "letterboxd", Label: "4.2"}, {Source: "trakt", Label: "8.6"},
		{Source: "mdblist", Label: "85"}, {Source: "rtaudience", Label: "91%"},
	}
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb", "rt", "metacritic", "letterboxd", "trakt", "mdblist", "rtaudience"}
	cfg.RatingsLayout = imageconfig.LayoutBottom
	cfg.BottomRatingsRow = true

	const w, h = 1000, 1500
	for _, offset := range []int{0, 60} {
		cfg.PosterEdgeOffset = offset
		shown, scale := fitBadgesToFrame("movie", cfg, w, h, eight, titleFacts{})
		inset := ratingStripDimsFor(scale, cfg).edgeX + posterEdgeInsetAt(scale, cfg)
		if got := singleRowWidthAt(scale, shown, cfg, titleFacts{}); got > w-2*inset {
			t.Errorf("edge offset %d: row of %d badges is %dpx, room is %dpx", offset, len(shown), got, w-2*inset)
		}
	}
}
