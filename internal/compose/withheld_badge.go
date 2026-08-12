package compose

import (
	"image"
	"image/color"
	"math"
)

// drawWithheldDash draws a single bar inside r, for a source held back by a
// setting rather than by a fault. Distinct from the X so a poster does not say
// "this source failed" when it means "this score was too thin to show".
func drawWithheldDash(dst *image.NRGBA, r image.Rectangle, col color.NRGBA, strokeW float64) {
	if r.Dx() <= 0 || r.Dy() <= 0 || col.A == 0 {
		return
	}
	cy := float64(r.Min.Y+r.Max.Y) / 2
	h := float64(r.Dy()) / 2
	half := h * math.Tan(unavailableXAngle/2*math.Pi/180)
	strokes := []ipSeg{{x1: float64(r.Min.X+r.Max.X)/2 - half, y1: cy,
		x2: float64(r.Min.X+r.Max.X)/2 + half, y2: cy, w: strokeW}}
	drawStrokes(dst, r, col, strokeW, strokes)
}
