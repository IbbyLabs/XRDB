package compose

import (
	"image"
	"image/color"
	"math"
	"strings"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// maxSourceRings caps how many per-source rings one render draws.
const maxSourceRings = 6

// sourceRing is one selected source's score as a ring.
type sourceRing struct {
	source string
	value  float64
}

// perSourceRings lists the selected sources that rated the title, in the
// configured order, skipping sources weighted to zero.
func perSourceRings(ratings []provider.Rating, cfg imageconfig.Config) []sourceRing {
	shares := resolveShares(cfg)
	out := make([]sourceRing, 0, len(cfg.Ratings))
	for _, source := range cfg.Ratings {
		if w, ok := shares[source]; ok && w <= 0 {
			continue
		}
		for _, r := range ratings {
			if strings.EqualFold(r.Source, source) && r.Value > 0 {
				out = append(out, sourceRing{source: strings.ToLower(source), value: math.Min(r.Value, 10)})
				break
			}
		}
		if len(out) == maxSourceRings {
			break
		}
	}
	return out
}

// drawPerSourceRings draws one ring per rated source in a row, each filled and
// coloured by its own score with the source's mark above or below it. The row
// is placed as one block, so it dodges other overlays like the single ring.
// It returns false when no selected source has a score.
func drawPerSourceRings(base *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config, scale float64, occ *occupancy) bool {
	rings := perSourceRings(ratings, cfg)
	if len(rings) == 0 {
		return false
	}
	ensureIcons()
	ensureFaces()
	s := func(v float64) int { return int(v*scale + 0.5) }
	edge := s(12)
	ringScale := scale
	if cfg.RingScale != 0 {
		ringScale *= float64(cfg.RingScale) / 100
	}
	// The row shrinks to fit the canvas width rather than spilling off it.
	cell := func(rs float64) (outerR, pad, logo, gap int) {
		outerR = int(26*rs + 0.5)
		pad = int(math.Max(7, float64(outerR)*2*0.17)) + 1
		logo = int(float64(outerR) * 0.95)
		gap = int(4*rs + 0.5)
		return
	}
	width := func(rs float64) int {
		outerR, pad, _, _ := cell(rs)
		return len(rings) * 2 * (outerR + pad)
	}
	if avail := base.Bounds().Dx() - 2*edge; avail > 0 && width(ringScale) > avail {
		ringScale *= float64(avail) / float64(width(ringScale))
	}
	outerR, pad, logo, gap := cell(ringScale)
	cellW := 2 * (outerR + pad)
	blockW := len(rings) * cellW
	blockH := cellW + logo + gap
	pos := cfg.RatingRingPos
	if pos == "" {
		pos = "br"
	}
	r := occ.placeNudged(pos, blockW, blockH, edge, edge, s(8), cfg.RingOffsetX, cfg.RingOffsetY)
	logoAbove := cfg.RingLogoPosition == "above"
	ringTop, logoTop := r.Min.Y, r.Min.Y+cellW+gap-pad
	if logoAbove {
		logoTop, ringTop = r.Min.Y+pad, r.Min.Y+logo+gap
	}
	face := valueFaceIn(cfg.RatingBadgeFont, ringScale*ringValueFontScale)
	glow := cfg.RingGlow == nil || *cfg.RingGlow
	for i, ring := range rings {
		cx := r.Min.X + i*cellW + cellW/2
		cy := ringTop + cellW/2
		fill := ratingRingFillColor(ring.value, cfg.RatingRingColor, cfg.AggregateDynamicStops)
		frostRoundedRect(base, image.Rect(cx-outerR, cy-outerR, cx+outerR, cy+outerR), outerR, squareNone, cfg.BadgeFrost)
		drawProgressRing(base, cx, cy, outerR, ring.value/10.0, fill, face, ringLabel(ring.value, false, cfg), cfg.RingCenterOpacity, glow)
		drawSourceMark(base, ring.source, image.Rect(cx-logo/2, logoTop, cx+logo/2, logoTop+logo))
	}
	return true
}

// drawSourceMark draws a rating source's mark, in its brand colours when it has
// them and in white otherwise.
func drawSourceMark(base *image.NRGBA, source string, rect image.Rectangle) {
	icon, ok := ratingIcons[source]
	if !ok {
		return
	}
	none := color.NRGBA{}
	if ratingIconColored[source] {
		drawBrandIcon(base, rect, icon, "", none, none, 0, false)
		return
	}
	drawTintedIcon(base, rect, icon, color.NRGBA{R: 255, G: 255, B: 255, A: 255}, "", none, none, 0, false)
}
