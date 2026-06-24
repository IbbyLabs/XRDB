package compose

import (
	"image"
	"image/color"
	"math"

	"golang.org/x/image/font"
	"golang.org/x/image/math/fixed"
)

// fillRoundedRect fills a rounded rectangle onto dst.
func fillRoundedRect(dst *image.NRGBA, r image.Rectangle, radius int, c color.NRGBA) {
	bounds := dst.Bounds()
	r = r.Intersect(bounds)
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			cov, skip := cornerCoverage(x, y, r, radius)
			if skip {
				continue
			}
			if cov < 1 {
				blendPixel(dst, x, y, color.NRGBA{R: c.R, G: c.G, B: c.B, A: uint8(float64(c.A) * cov)})
				continue
			}
			dst.SetNRGBA(x, y, c)
		}
	}
}

func inCornerZone(x, y int, r image.Rectangle, radius int) bool {
	return (x < r.Min.X+radius || x >= r.Max.X-radius) &&
		(y < r.Min.Y+radius || y >= r.Max.Y-radius)
}

func cornerCenter(x, y int, r image.Rectangle, radius int) (float64, float64) {
	var cx, cy float64
	if x < r.Min.X+radius {
		cx = float64(r.Min.X + radius)
	} else {
		cx = float64(r.Max.X - radius)
	}
	if y < r.Min.Y+radius {
		cy = float64(r.Min.Y + radius)
	} else {
		cy = float64(r.Max.Y - radius)
	}
	return cx, cy
}

// cornerCoverage returns the anti-aliased sub-pixel coverage for (x, y) at the
// rounded corners of r. skip=true means the pixel is outside the arc and should
// be discarded. When skip is false, coverage is in (0,1]: callers should blend
// at partial alpha when coverage < 1, or write fully when coverage == 1.
func cornerCoverage(x, y int, r image.Rectangle, radius int) (coverage float64, skip bool) {
	if !inCornerZone(x, y, r, radius) {
		return 1, false
	}
	cx, cy := cornerCenter(x, y, r, radius)
	dx := float64(x) - cx + 0.5
	dy := float64(y) - cy + 0.5
	cr := float64(radius)
	dist := math.Sqrt(dx*dx + dy*dy)
	if dist >= cr+0.5 {
		return 0, true
	}
	if dist > cr-0.5 {
		return cr + 0.5 - dist, false
	}
	return 1, false
}

// fillRect fills a rectangle on dst with c (no alpha blending).
func fillRect(dst *image.NRGBA, r image.Rectangle, c color.NRGBA) {
	b := dst.Bounds()
	r = r.Intersect(b)
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			dst.SetNRGBA(x, y, c)
		}
	}
}

// drawText renders s onto dst at the given baseline (x, y) using face.
func drawText(dst *image.NRGBA, face font.Face, x, y int, c color.Color, s string) {
	d := &font.Drawer{
		Dst:  dst,
		Src:  image.NewUniform(c),
		Face: face,
		Dot:  fixed.P(x, y),
	}
	d.DrawString(s)
}

// textWidth returns the rendered pixel width of s using face.
func textWidth(face font.Face, s string) int {
	return font.MeasureString(face, s).Ceil()
}

// blendPixel alpha-blends color c over the existing pixel at (x, y).
func blendPixel(dst *image.NRGBA, x, y int, c color.NRGBA) {
	if !image.Pt(x, y).In(dst.Bounds()) {
		return
	}
	if c.A == 255 {
		dst.SetNRGBA(x, y, c)
		return
	}
	dp := dst.NRGBAAt(x, y)
	a := uint32(c.A)
	ia := 255 - a
	dst.SetNRGBA(x, y, color.NRGBA{
		R: uint8((uint32(c.R)*a + uint32(dp.R)*ia) / 255),
		G: uint8((uint32(c.G)*a + uint32(dp.G)*ia) / 255),
		B: uint8((uint32(c.B)*a + uint32(dp.B)*ia) / 255),
		A: uint8((a*255 + uint32(dp.A)*ia) / 255),
	})
}

// drawRectBorder draws a 1px border around a rounded rectangle.
func drawRectBorder(dst *image.NRGBA, r image.Rectangle, radius int, c color.NRGBA) {
	b := dst.Bounds()
	for x := r.Min.X; x < r.Max.X; x++ {
		onEdge := x == r.Min.X || x == r.Max.X-1
		for y := r.Min.Y; y < r.Max.Y; y++ {
			if !onEdge && y != r.Min.Y && y != r.Max.Y-1 {
				continue
			}
			pt := image.Pt(x, y)
			if !pt.In(b) {
				continue
			}
			cov, skip := cornerCoverage(x, y, r, radius)
			if skip {
				continue
			}
			if cov < 1 {
				blendPixel(dst, x, y, color.NRGBA{R: c.R, G: c.G, B: c.B, A: uint8(float64(c.A) * cov)})
				continue
			}
			dst.SetNRGBA(x, y, c)
		}
	}
}

// fitRect returns the largest rectangle with the srcW×srcH aspect ratio that
// fits inside dst, centered within it.
func fitRect(srcW, srcH int, dst image.Rectangle) image.Rectangle {
	if srcW <= 0 || srcH <= 0 || dst.Dx() <= 0 || dst.Dy() <= 0 {
		return dst
	}
	scale := math.Min(float64(dst.Dx())/float64(srcW), float64(dst.Dy())/float64(srcH))
	w := int(float64(srcW)*scale + 0.5)
	h := int(float64(srcH)*scale + 0.5)
	x := dst.Min.X + (dst.Dx()-w)/2
	y := dst.Min.Y + (dst.Dy()-h)/2
	return image.Rect(x, y, x+w, y+h)
}

// fillFlame draws a small upward flame/teardrop: a point at the apex (cx, topY)
// tapering down to a rounded base of half-width halfW whose bottom sits at
// topY+height. Used as the "trending" accent.
func fillFlame(dst *image.NRGBA, cx, topY, halfW, height int, c color.NRGBA) {
	if height <= 0 || halfW <= 0 {
		return
	}
	r := float64(halfW)
	apex := float64(topY)
	// Centre of the rounded base, placed so the base bottom touches topY+height.
	cyc := float64(topY+height) - r
	if cyc <= apex {
		cyc = apex + 1
	}
	for y := 0; y < height; y++ {
		py := float64(topY + y)
		var hw float64
		if py <= cyc {
			// Upper taper: 0 at the apex, growing convexly to r at the base.
			t := (py - apex) / (cyc - apex)
			hw = r * math.Pow(t, 0.7)
		} else {
			// Rounded base.
			dy := py - cyc
			if dy < r {
				hw = math.Sqrt(r*r - dy*dy)
			}
		}
		ihw := int(hw + 0.5)
		for x := cx - ihw; x <= cx+ihw; x++ {
			blendPixel(dst, x, topY+y, c)
		}
	}
}
