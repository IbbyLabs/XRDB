package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// On a small surface (episode thumbnail) the base cap binds at 100%, so the
// scale control was inert — every value collapsed to the same size. A higher
// configured scale must now produce a visibly larger badge, still bounded.
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
	small := fitBadgeScale(resolveBadgeScale(base, thumbW, thumbH, ratings), thumbW, thumbH, ratings, base)
	large := fitBadgeScale(resolveBadgeScale(big, thumbW, thumbH, ratings), thumbW, thumbH, ratings, big)

	if large <= small {
		t.Errorf("scale 300 (%.2f) did not exceed scale 100 (%.2f) on a thumbnail", large, small)
	}
}

// The hard ceiling still applies: an absurd scale cannot make the badge swallow
// the frame.
func TestBadgeCapCeilingHolds(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingBadgeScale = 1000
	w, h := badgeShareCaps(cfg, 320)
	if w > hardBadgeWidthShare || h > hardBadgeHeightShare {
		t.Errorf("caps exceeded the ceiling: w=%.2f h=%.2f", w, h)
	}
}

// At the default scale the caps are unchanged, so posters/backdrops are
// unaffected.
func TestBadgeCapsUnchangedAtDefault(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingBadgeScale = 100
	w, h := badgeShareCaps(cfg, 320)
	if w != maxBadgeWidthShare || h != maxBadgeHeightShare {
		t.Errorf("default caps changed: w=%.2f h=%.2f", w, h)
	}
}
