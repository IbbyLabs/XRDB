package compose

import (
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

// Frame-share caps that posters and backdrops used before the caps grew with
// the configured scale.
const (
	legacyBadgeHeightShare = maxBadgeHeightShare
	legacyBadgeWidthShare  = maxBadgeWidthShare
)

// LegacyEquivalentBadgeScale returns the highest RatingBadgeScale percent, not
// below 100, whose rendered badge size under the current caps does not exceed
// what the saved scale rendered under the fixed base caps. ratings are the
// badge values to measure; the smallest result across them is returned.
func LegacyEquivalentBadgeScale(mediaType string, cfg imageconfig.Config, ratings []provider.Rating) int {
	saved := cfg.RatingBadgeScale
	if saved <= 100 || len(ratings) == 0 {
		return saved
	}
	dim := render.DimensionsForSize(mediaType, string(cfg.Size))
	if dim.Width <= 0 || dim.Height <= 0 {
		return saved
	}
	ensureFaces()
	ensureIcons()
	facts := titleFacts{}
	safe := thumbnailSafeInsetPx(mediaType, dim.Width, cfg)
	raw := frameScale(mediaType, dim.Width, cfg.Size)
	old := fitBadgeScaleShares(raw*float64(saved)/100, dim.Width, dim.Height, safe,
		legacyBadgeWidthShare, legacyBadgeHeightShare, ratings, cfg, facts)

	// The new fit is monotonic in the percent: find the largest one that stays
	// at or below the old size.
	const eps = 1e-9
	lo, hi := 100, saved
	for lo < hi {
		mid := (lo + hi + 1) / 2
		c := cfg
		c.RatingBadgeScale = mid
		if resolveBadgeScale(mediaType, c, dim.Width, dim.Height, ratings, facts) <= old+eps {
			lo = mid
		} else {
			hi = mid - 1
		}
	}
	return lo
}
