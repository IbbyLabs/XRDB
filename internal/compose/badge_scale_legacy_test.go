package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func TestLegacyEquivalentBadgeScaleNeverRaisesAndMatchesOldSize(t *testing.T) {
	ensureFaces()
	ensureIcons()
	ratings := []provider.Rating{
		{Source: "imdb", Value: 8.4, Label: "8.4"},
		{Source: "tmdb", Value: 7.8, Label: "78%"},
		{Source: "rt", Value: 9.1, Label: "91%"},
	}
	cfg := imageconfig.Default()
	cfg.BadgeStyle = imageconfig.BadgeStacked
	cfg.Ratings = []string{"imdb", "tmdb", "rt"}

	const w, h = 780, 1170
	for _, saved := range []int{100, 120, 200, 400, 600} {
		c := cfg
		c.RatingBadgeScale = saved
		got := LegacyEquivalentBadgeScale("poster", c, ratings)
		if got > saved || got < 100 {
			t.Errorf("saved %d gave %d, want within [100, %d]", saved, got, saved)
		}
		old := fitBadgeScaleShares(frameScale("poster", w, c.Size)*float64(saved)/100, w, h, 0,
			legacyBadgeWidthShare, legacyBadgeHeightShare, ratings, c, titleFacts{})
		c.RatingBadgeScale = got
		if now := resolveBadgeScale("poster", c, w, h, ratings, titleFacts{}); now > old+1e-9 {
			t.Errorf("saved %d: new scale %.3f exceeds the old %.3f", saved, now, old)
		}
	}
}
