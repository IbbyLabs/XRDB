package compose

import (
	"image"
	"image/color"
	"math"
)

// A source that was wanted and held out used to vanish from the strip, which
// looks exactly like a title with no score. The badge stays, dimmed, with an X
// where the number goes. The source mark stays at full strength: it is the part
// that makes the badge read as "this site is unavailable" rather than as
// something that failed to draw.
const (
	// unavailableXAngle is the angle between the two strokes, in degrees.
	// Chosen at real badge size: 117° reads as two crossed strokes rather than
	// a letter, 48° reads as an X but crowds the pill, 64° survives being small.
	unavailableXAngle = 64.0
	// unavailableDim scales the plate's alpha. The badge has to recede without
	// disappearing, or it reads as a rendering fault.
	unavailableDim = 0.55
	// unavailableXSample is the supersampling grid per pixel. The strokes are
	// diagonal, so without it the edges stair-step at badge size.
	unavailableXSample = 3
)

// dimmed scales a colour's alpha, leaving its hue alone.
func dimmed(c color.NRGBA, f float64) color.NRGBA {
	c.A = uint8(math.Round(float64(c.A) * f))
	return c
}

// drawUnavailableX draws the X inside r. Height drives the geometry so the
// glyph keeps its proportions whatever width the value area happens to be.
func drawUnavailableX(dst *image.NRGBA, r image.Rectangle, col color.NRGBA, strokeW float64) {
	if r.Dx() <= 0 || r.Dy() <= 0 || col.A == 0 {
		return
	}
	half := math.Tan(unavailableXAngle / 2 * math.Pi / 180)
	cx := float64(r.Min.X+r.Max.X) / 2
	cy := float64(r.Min.Y+r.Max.Y) / 2
	h := float64(r.Dy()) / 2
	dx := h * half

	strokes := []ipSeg{
		{x1: cx - dx, y1: cy - h, x2: cx + dx, y2: cy + h, w: strokeW},
		{x1: cx + dx, y1: cy - h, x2: cx - dx, y2: cy + h, w: strokeW},
	}

	// The strokes cross, so coverage is computed per pixel over both before
	// blending. Blending each in turn would double the alpha where they meet.
	pad := int(math.Ceil(strokeW))
	area := image.Rect(r.Min.X-pad, r.Min.Y-pad, r.Max.X+pad, r.Max.Y+pad).Intersect(dst.Bounds())
	step := 1.0 / float64(unavailableXSample)
	for y := area.Min.Y; y < area.Max.Y; y++ {
		for x := area.Min.X; x < area.Max.X; x++ {
			hits := 0
			for sy := 0; sy < unavailableXSample; sy++ {
				for sx := 0; sx < unavailableXSample; sx++ {
					px := float64(x) + (float64(sx)+0.5)*step
					py := float64(y) + (float64(sy)+0.5)*step
					if strokes[0].covers(px, py) || strokes[1].covers(px, py) {
						hits++
					}
				}
			}
			if hits == 0 {
				continue
			}
			cov := float64(hits) / float64(unavailableXSample*unavailableXSample)
			blendPixel(dst, x, y, dimmed(col, cov))
		}
	}
}
