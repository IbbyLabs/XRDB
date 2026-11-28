package compose

import (
	"image"
	"image/color"
	"strings"

	"xrdb_rewrite/internal/imageconfig"
)

var (
	watchedTrackColor = color.NRGBA{R: 0, G: 0, B: 0, A: 120}
	watchedFillColor  = color.NRGBA{R: 255, G: 255, B: 255, A: 230}
)

// watchedBarHeight is the bar's thickness at scale 1, in pixels.
const watchedBarHeight = 6

// drawWatchedBar draws the owner's progress, 1-100, as a thin bar along the
// poster's bottom edge. A bottom aggregate bar keeps that edge, so the watched
// bar sits on top of it.
func drawWatchedBar(base *image.NRGBA, pct int, cfg imageconfig.Config) {
	if pct <= 0 {
		return
	}
	if pct > 100 {
		pct = 100
	}
	b := base.Bounds()
	scale := frameScale("poster", b.Dx(), cfg.Size)
	h := int(watchedBarHeight*scale + 0.5)
	if h < 2 {
		h = 2
	}
	bottom := b.Max.Y
	if cfg.AggregateBar && strings.ToLower(cfg.AggregateBarPos) != "top" {
		barPct := cfg.AggregateBarScale
		if barPct == 0 {
			barPct = 100
		}
		aggH := int(10*scale*float64(barPct)/100 + 0.5)
		off := int(float64(cfg.AggregateBarOffset)*scale + 0.5)
		if top := b.Max.Y - aggH - off; top < bottom {
			bottom = top
		}
	}
	track := image.Rect(b.Min.X, bottom-h, b.Max.X, bottom)
	blendRect(base, track, watchedTrackColor)
	fillW := b.Dx() * pct / 100
	if fillW < 1 {
		fillW = 1
	}
	blendRect(base, image.Rect(b.Min.X, bottom-h, b.Min.X+fillW, bottom), watchedFillColor)
}

func blendRect(dst *image.NRGBA, r image.Rectangle, c color.NRGBA) {
	r = r.Intersect(dst.Bounds())
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			blendPixel(dst, x, y, c)
		}
	}
}
