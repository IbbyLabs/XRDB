package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// A higher configured scale produces a larger badge on a small surface, still bounded.
func TestBadgeScaleControlWorksOnAThumbnail(t *testing.T) {
	ensureFaces()
	ensureIcons()
	ratings := []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}

	base := imageconfig.Default()
	base.Ratings = []string{"imdb"}
	base.RatingBadgeScale = 100
	big := base
	big.RatingBadgeScale = 300

	const thumbW, thumbH = 320, 180
	small := fitBadgeScale(resolveBadgeScale("", base, thumbW, thumbH, ratings, titleFacts{}), thumbW, thumbH, ratings, base, titleFacts{})
	large := fitBadgeScale(resolveBadgeScale("", big, thumbW, thumbH, ratings, titleFacts{}), thumbW, thumbH, ratings, big, titleFacts{})

	if large <= small {
		t.Errorf("scale 300 (%.2f) did not exceed scale 100 (%.2f) on a thumbnail", large, small)
	}
}

// A logo is wide but short (~800x200); the scale control still grows the badge.
func TestBadgeScaleControlWorksOnALogo(t *testing.T) {
	ensureFaces()
	ensureIcons()
	ratings := []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}

	base := imageconfig.Default()
	base.Ratings = []string{"imdb"}
	base.RatingBadgeScale = 100
	big := base
	big.RatingBadgeScale = 300

	const logoW, logoH = 800, 200
	small := fitBadgeScale(resolveBadgeScale("", base, logoW, logoH, ratings, titleFacts{}), logoW, logoH, ratings, base, titleFacts{})
	large := fitBadgeScale(resolveBadgeScale("", big, logoW, logoH, ratings, titleFacts{}), logoW, logoH, ratings, big, titleFacts{})

	if large <= small {
		t.Errorf("scale 300 (%.2f) did not exceed scale 100 (%.2f) on a logo", large, small)
	}
}

// The hard ceiling still applies: an absurd scale cannot make the badge swallow
// the frame.
func TestBadgeCapCeilingHolds(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingBadgeScale = 1000
	w, h := badgeShareCaps(cfg, 320, 180)
	if w > hardBadgeWidthShare || h > hardBadgeHeightShare {
		t.Errorf("caps exceeded the ceiling: w=%.2f h=%.2f", w, h)
	}
}

// At the default scale the caps are the base shares on every frame.
func TestBadgeCapsUnchangedAtDefault(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingBadgeScale = 100
	w, h := badgeShareCaps(cfg, 320, 180)
	if w != maxBadgeWidthShare || h != maxBadgeHeightShare {
		t.Errorf("default caps changed: w=%.2f h=%.2f", w, h)
	}
}

// Posters and backdrops relax both caps with the scale, up to the ceilings.
func TestBadgeCapsGrowWithScaleOnPosters(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingBadgeScale = 200
	for _, dim := range [][2]int{{780, 1170}, {1280, 720}} {
		w, h := badgeShareCaps(cfg, dim[0], dim[1])
		if w != maxBadgeWidthShare*2 || h != maxBadgeHeightShare*2 {
			t.Errorf("%dx%d caps at 200: w=%.2f h=%.2f", dim[0], dim[1], w, h)
		}
	}
	cfg.RatingBadgeScale = 600
	if w, h := badgeShareCaps(cfg, 780, 1170); w != hardBadgeWidthShare || h != hardBadgeHeightShare {
		t.Errorf("caps at 600 not at the ceilings: w=%.2f h=%.2f", w, h)
	}
}

// At 100% a poster badge is unreduced; at 300% a stacked badge is larger than at 140%.
func TestPosterStackedBadgeKeepsGrowingPast140(t *testing.T) {
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
	at := func(pct int) float64 {
		c := cfg
		c.RatingBadgeScale = pct
		return resolveBadgeScale("poster", c, w, h, ratings, titleFacts{})
	}
	if got, want := at(100), frameScale("poster", w, cfg.Size); got != want {
		t.Errorf("scale at 100 = %.3f, want the unreduced %.3f", got, want)
	}
	if s140, s300 := at(140), at(300); s300 <= s140 {
		t.Errorf("scale at 300 (%.3f) did not exceed scale at 140 (%.3f)", s300, s140)
	}
}
