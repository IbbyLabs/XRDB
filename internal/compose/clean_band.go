package compose

import (
	"image"
	"math"

	"xrdb_rewrite/internal/imageconfig"
)

// cleanBandActive reports whether a clean genre label takes the poster's foot as
// its own band, as v2's clean style did.
func cleanBandActive(mediaType string, cfg imageconfig.Config, hasGenres bool) bool {
	return mediaType == "poster" && cfg.Genre && hasGenres &&
		cfg.GenreBadgeStyle == "clean" && cfg.GenreBadgeMode != "off" && cfg.GenrePos == "bc"
}

// drawCleanGenreBand draws v2's bottom scrim and the clean label at the foot of
// the poster, reserves the band, and returns how far above the frame's bottom
// edge the band starts.
func drawCleanGenreBand(base *image.NRGBA, genres []string, scale float64, occ *occupancy, opts genreBadgeOpts) int {
	b := base.Bounds()
	face := cleanLabelFaceIn(opts.font, cleanLabelScale(b, opts.scalePercent))
	m := face.Metrics()
	labelH := (m.Ascent + m.Descent).Ceil()
	inset := int(math.Round(float64(b.Dy()) * 0.013))
	labelTop := b.Max.Y - labelH - inset
	drawCleanScrim(base, labelTop-int(math.Round(float64(labelH)*1.05)), opts.bgOpacity)

	local := newOccupancy(b)
	drawGenreBadge(base, genres, "bc", scale, local, opts)
	top := labelTop
	for _, r := range local.rects {
		if r.Min.Y < top {
			top = r.Min.Y
		}
	}
	occ.reserve(image.Rect(b.Min.X, top, b.Max.X, b.Max.Y))
	return b.Max.Y - top
}

// drawCleanScrim darkens from top to the bottom edge with v2's four-stop ramp.
// bgOpacity is the clean style's background percent; 0 is v2's default of 28.
func drawCleanScrim(base *image.NRGBA, top, bgOpacity int) {
	b := base.Bounds()
	if top < b.Min.Y {
		top = b.Min.Y
	}
	h := b.Max.Y - top
	if h <= 0 {
		return
	}
	raw := 0.28
	if bgOpacity > 0 {
		raw = math.Min(100, float64(bgOpacity)) / 100
	}
	peak := math.Min(0.93, 0.72+raw*0.21)
	stops := [][2]float64{{0, 0}, {0.24, math.Min(0.26, peak*0.2)}, {0.52, math.Min(0.62, peak*0.52)}, {0.78, math.Min(0.84, peak*0.78)}, {1, peak}}
	for y := top; y < b.Max.Y; y++ {
		t := float64(y-top) / float64(h)
		a := 0.0
		for i := 1; i < len(stops); i++ {
			if t <= stops[i][0] {
				p := (t - stops[i-1][0]) / (stops[i][0] - stops[i-1][0])
				a = stops[i-1][1] + p*(stops[i][1]-stops[i-1][1])
				break
			}
		}
		alpha := uint8(a*255 + 0.5)
		for x := b.Min.X; x < b.Max.X; x++ {
			base.SetNRGBA(x, y, blendScrim(base.NRGBAAt(x, y), alpha))
		}
	}
}
