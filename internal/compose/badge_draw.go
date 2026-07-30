package compose

import (
	"image"
	"image/color"
	"math"

	"golang.org/x/image/font"
	"golang.org/x/image/math/fixed"
)

// fillRoundedRect fills a rounded rectangle onto dst.
// squaredCorners names the edge a shape is anchored against. The two corners on
// that edge are drawn square, which is what makes a badge read as attached to
// the edge rather than floating near it.
type squaredCorners uint8

const (
	squareNone squaredCorners = iota
	squareTop
	squareBottom
	squareLeft
	squareRight
)

// squaredCornersFor maps a ratings layout to the edge its strip hangs from.
func squaredCornersFor(layout string) squaredCorners {
	switch layout {
	case "top":
		return squareTop
	case "bottom":
		return squareBottom
	case "left":
		return squareLeft
	case "right":
		return squareRight
	}
	return squareNone
}

// onSquaredEdge reports whether (x, y) sits in a corner zone that sq keeps
// square.
func onSquaredEdge(x, y int, r image.Rectangle, radius int, sq squaredCorners) bool {
	switch sq {
	case squareTop:
		return y < r.Min.Y+radius
	case squareBottom:
		return y >= r.Max.Y-radius
	case squareLeft:
		return x < r.Min.X+radius
	case squareRight:
		return x >= r.Max.X-radius
	}
	return false
}

func fillRoundedRect(dst *image.NRGBA, r image.Rectangle, radius int, c color.NRGBA) {
	fillRoundedRectSquared(dst, r, radius, squareNone, c)
}

func fillRoundedRectSquared(dst *image.NRGBA, r image.Rectangle, radius int, sq squaredCorners, c color.NRGBA) {
	bounds := dst.Bounds()
	r = r.Intersect(bounds)
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			if sq != squareNone && onSquaredEdge(x, y, r, radius, sq) {
				dst.SetNRGBA(x, y, c)
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
// strokeRoundedRect strokes a band of the given width inward from the rounded
// outline of r. drawRectBorder walks only the four straight edges and clips
// them against the corner radius, so it cannot draw the curve itself; on a
// capsule that leaves a bar top and bottom and a stub at each end. This follows
// the outline the fill uses.
func strokeRoundedRect(dst *image.NRGBA, r image.Rectangle, radius, width int, c color.NRGBA) {
	if width < 1 {
		width = 1
	}
	cx := float64(r.Min.X+r.Max.X) / 2
	cy := float64(r.Min.Y+r.Max.Y) / 2
	hw, hh := float64(r.Dx())/2, float64(r.Dy())/2
	rr := math.Min(float64(radius), math.Min(hw, hh))
	w := float64(width)
	b := dst.Bounds()
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			if !image.Pt(x, y).In(b) {
				continue
			}
			// Signed distance to the rounded outline: zero on it, negative in.
			qx := math.Abs(float64(x)+0.5-cx) - (hw - rr)
			qy := math.Abs(float64(y)+0.5-cy) - (hh - rr)
			mx, my := math.Max(qx, 0), math.Max(qy, 0)
			d := math.Sqrt(mx*mx+my*my) + math.Min(math.Max(qx, qy), 0) - rr
			cov := math.Min(1, math.Max(0, 0.5-d)) * math.Min(1, math.Max(0, d+w+0.5))
			if cov <= 0 {
				continue
			}
			blendPixel(dst, x, y, color.NRGBA{R: c.R, G: c.G, B: c.B, A: uint8(float64(c.A)*cov + 0.5)})
		}
	}
}

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

// ptf is a floating-point point used for vector glyph paths.
type ptf struct{ x, y float64 }

// distToSegment returns the distance from (px, py) to the line segment a→b.
func distToSegment(px, py float64, a, b ptf) float64 {
	vx, vy := b.x-a.x, b.y-a.y
	wx, wy := px-a.x, py-a.y
	seg2 := vx*vx + vy*vy
	t := 0.0
	if seg2 > 0 {
		t = (wx*vx + wy*vy) / seg2
		if t < 0 {
			t = 0
		} else if t > 1 {
			t = 1
		}
	}
	dx := px - (a.x + t*vx)
	dy := py - (a.y + t*vy)
	return math.Sqrt(dx*dx + dy*dy)
}

// strokePolyline draws an anti-aliased thick polyline through pts. Joints and
// caps are rounded (the fill is the half-width neighbourhood of the path), so
// it stays crisp at small sizes. halfW is the half stroke width in pixels.
func strokePolyline(dst *image.NRGBA, pts []ptf, halfW float64, c color.NRGBA) {
	if len(pts) < 2 || halfW <= 0 {
		return
	}
	minX, minY := math.Inf(1), math.Inf(1)
	maxX, maxY := math.Inf(-1), math.Inf(-1)
	for _, p := range pts {
		minX, maxX = math.Min(minX, p.x), math.Max(maxX, p.x)
		minY, maxY = math.Min(minY, p.y), math.Max(maxY, p.y)
	}
	pad := halfW + 1
	x0, x1 := int(math.Floor(minX-pad)), int(math.Ceil(maxX+pad))
	y0, y1 := int(math.Floor(minY-pad)), int(math.Ceil(maxY+pad))
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; x++ {
			px, py := float64(x)+0.5, float64(y)+0.5
			d := math.Inf(1)
			for i := 0; i+1 < len(pts); i++ {
				if dd := distToSegment(px, py, pts[i], pts[i+1]); dd < d {
					d = dd
				}
			}
			cov := halfW + 0.5 - d
			if cov <= 0 {
				continue
			}
			if cov > 1 {
				cov = 1
			}
			blendPixel(dst, x, y, color.NRGBA{R: c.R, G: c.G, B: c.B, A: uint8(float64(c.A) * cov)})
		}
	}
}

// fillTrendArrow draws the canonical "trending up" glyph — a rising zig-zag
// line ending in a corner arrowhead at the top-right — inside the w×h box whose
// top-left is (x, y). Stroke half-width is halfW. Reads instantly as "trending"
// and stays sharp where a small filled flame turns to mush.
func fillTrendArrow(dst *image.NRGBA, x, y, w, h int, halfW float64, c color.NRGBA) {
	p := func(nx, ny float64) ptf {
		return ptf{x: float64(x) + nx*float64(w), y: float64(y) + ny*float64(h)}
	}
	// Stock-chart wiggle up to the tip at the top-right corner.
	strokePolyline(dst, []ptf{p(0.05, 0.74), p(0.40, 0.40), p(0.56, 0.56), p(0.93, 0.16)}, halfW, c)
	// Corner arrowhead: one arm left, one arm down, meeting at the tip.
	strokePolyline(dst, []ptf{p(0.62, 0.16), p(0.93, 0.16), p(0.93, 0.47)}, halfW, c)
}

// lighten blends c toward white by fraction f (0..1), preserving alpha.
func lighten(c color.NRGBA, f float64) color.NRGBA {
	mix := func(v uint8) uint8 {
		nv := float64(v) + (255-float64(v))*f
		if nv > 255 {
			nv = 255
		}
		return uint8(nv)
	}
	return color.NRGBA{R: mix(c.R), G: mix(c.G), B: mix(c.B), A: c.A}
}

// flameTongue fills one asymmetric flame tongue with horizontal anti-aliasing.
// apexY is the tip, r the base half-width, height the full height. lean curls
// the tip sideways (strongest near the tip); tipPow controls tip sharpness
// (higher = sharper). Used by fillFlameSharp to stack an inner + outer flame.
func flameTongue(dst *image.NRGBA, cx, apexY, r, height, lean, tipPow float64, c color.NRGBA) {
	cyc := apexY + height - r // centre of the rounded base
	if cyc <= apexY {
		cyc = apexY + 1
	}
	for y := int(math.Floor(apexY)); y < int(math.Ceil(apexY+height)); y++ {
		py := float64(y) + 0.5
		if py < apexY {
			continue
		}
		var hw, tt float64
		if py <= cyc {
			tt = (py - apexY) / (cyc - apexY)
			hw = r * math.Pow(tt, tipPow)
		} else {
			tt = 1
			if dy := py - cyc; dy < r {
				hw = math.Sqrt(r*r - dy*dy)
			}
		}
		if hw < 0.4 {
			continue
		}
		center := cx + lean*r*math.Sin((1-tt)*1.6) // curl, strongest at the tip
		left, right := center-hw, center+hw
		for x := int(math.Floor(left)); x < int(math.Ceil(right)); x++ {
			cov := math.Min(float64(x)+1, right) - math.Max(float64(x), left)
			if cov <= 0 {
				continue
			}
			if cov > 1 {
				cov = 1
			}
			blendPixel(dst, x, y, color.NRGBA{R: c.R, G: c.G, B: c.B, A: uint8(float64(c.A) * cov)})
		}
	}
}

// fillFlameSharp draws a stylized flame: an asymmetric tongue with a curled,
// sharp tip over a lighter inner flame, so it reads as fire rather than a plain
// teardrop. cx is the base centre, topY the apex, halfW the base half-width.
func fillFlameSharp(dst *image.NRGBA, cx, topY, halfW, height int, c color.NRGBA) {
	if height <= 0 || halfW <= 0 {
		return
	}
	fcx, ftop := float64(cx), float64(topY)
	fhw, fh := float64(halfW), float64(height)
	// Outer flame: pronounced rightward hook at a sharp tip breaks the
	// symmetric-teardrop read.
	flameTongue(dst, fcx, ftop, fhw, fh, 0.58, 1.05, c)
	// Hot core: large, bright, lifted — the bright inner flame is what sells
	// "fire" rather than "water drop".
	flameTongue(dst, fcx+fhw*0.20, ftop+fh*0.30, fhw*0.58, fh*0.64, 0.40, 1.15, lighten(c, 0.74))
}
