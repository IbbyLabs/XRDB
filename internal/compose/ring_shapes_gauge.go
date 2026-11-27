package compose

import (
	"image"
	"image/color"
	"math"
)

// The gauge shapes fill part of their art to the score's share of the scale.

const signalBarCount = 5

var ringShapeDim = color.NRGBA{R: 120, G: 124, B: 132, A: 140}

// fillBoxAA fills a rounded box given in base coordinates, visiting only its
// own pixels.
func fillBoxAA(base *image.NRGBA, x0, y0, x1, y1, rr float64, c color.NRGBA) {
	r := image.Rect(int(math.Floor(x0)), int(math.Floor(y0)), int(math.Ceil(x1)), int(math.Ceil(y1)))
	ox, oy := float64(r.Min.X), float64(r.Min.Y)
	cx, cy, hw, hh := (x0+x1)/2-ox, (y0+y1)/2-oy, (x1-x0)/2, (y1-y0)/2
	rr = math.Min(rr, math.Min(hw, hh))
	fillShapeAA(base, r, c, func(x, y float64) bool { return roundedBox(x, y, cx, cy, hw, hh, rr) })
}

// barsLayout is the signal-bar badge's padding, bar width, bar gap and the gap
// before the score, for a badge h pixels tall.
func barsLayout(h float64) (pad, bw, gap, textGap float64) {
	return h * 0.28, h * 0.13, h * 0.06, h * 0.2
}

func barsRingShapeSize(outerR int, a ringShapeArt) (int, int) {
	h := float64(outerR) * 1.35
	pad, bw, gap, textGap := barsLayout(h)
	w := 2*pad + signalBarCount*bw + (signalBarCount-1)*gap
	if a.label != "" {
		w += textGap + float64(textWidth(a.face, a.label))
	}
	return int(w + 0.5), int(h + 0.5)
}

// litBars is how many of the signal bars a 0-1 share lights.
func litBars(frac float64) int {
	return int(math.Round(math.Min(math.Max(frac, 0), 1) * signalBarCount))
}

func drawRingShapeBars(base *image.NRGBA, r image.Rectangle, a ringShapeArt) {
	h := float64(r.Dy())
	pad, bw, gap, textGap := barsLayout(h)
	blendRoundedRect(base, r, int(h*0.3+0.5), ringShapeDark)
	fill := shapeFill(a)
	lit := litBars(a.frac)
	x := float64(r.Min.X) + pad
	bottom := float64(r.Min.Y) + h*0.78
	span := h * 0.56
	for i := 0; i < signalBarCount; i++ {
		c := ringShapeDim
		if i < lit {
			c = fill
		}
		top := bottom - span*float64(i+1)/signalBarCount
		fillBoxAA(base, x, top, x+bw, bottom, bw*0.3, c)
		x += bw + gap
	}
	if a.label == "" || a.face == nil {
		return
	}
	fm := a.face.Metrics()
	tx := int(x - gap + textGap + 0.5)
	drawText(base, a.face, tx, r.Min.Y+r.Dy()/2+(fm.Ascent.Ceil()-fm.Descent.Ceil())/2, ringShapeWhite, a.label)
}

func fillPillRingShapeSize(outerR int, a ringShapeArt) (int, int) {
	h := float64(outerR) * 1.3
	w := math.Max(h*2.7, float64(textWidth(a.face, a.label))+h*1.4)
	return int(w + 0.5), int(h + 0.5)
}

func drawRingShapeFillPill(base *image.NRGBA, r image.Rectangle, a ringShapeArt) {
	w, h := float64(r.Dx()), float64(r.Dy())
	fill := shapeFill(a)
	t := math.Max(1.5, h*0.08)
	pill := func(inset float64) func(x, y float64) bool {
		hw, hh := w/2-inset, h/2-inset
		return func(x, y float64) bool { return roundedBox(x, y, w/2, h/2, hw, hh, hh) }
	}
	fillShapeAA(base, r, fill, pill(0))
	fillShapeAA(base, r, ringShapeSolidDark, pill(t))
	g := t * 1.7
	frac := math.Min(math.Max(a.frac, 0), 1)
	edge := g + (w-2*g)*frac
	if frac > 0 {
		inner := pill(g)
		fillShapeAA(base, r, fill, func(x, y float64) bool { return x <= edge && inner(x, y) })
	}
	if a.label == "" || a.face == nil {
		return
	}
	// The score changes colour where the fill ends, so each half reads on its own ground.
	split := r.Min.X + int(edge+0.5)
	cx, cy := r.Min.X+r.Dx()/2, r.Min.Y+r.Dy()/2
	if left := r.Intersect(image.Rect(r.Min.X, r.Min.Y, split, r.Max.Y)); !left.Empty() {
		drawCentredLabel(base.SubImage(left).(*image.NRGBA), a.face, cx, cy, inkOn(fill), a.label)
	}
	if right := r.Intersect(image.Rect(split, r.Min.Y, r.Max.X, r.Max.Y)); !right.Empty() {
		drawCentredLabel(base.SubImage(right).(*image.NRGBA), a.face, cx, cy, ringShapeWhite, a.label)
	}
}

// The dial's arc runs clockwise from the bottom left to the bottom right, with
// angles measured clockwise from straight down.
const (
	dialStart = math.Pi / 4
	dialSweep = 3 * math.Pi / 2
)

// dialArc reports whether (x, y) lies on the arc band between rIn and rOut
// around (c, c) covering sweep radians from dialStart, with round caps.
func dialArc(c, rIn, rOut, sweep float64) func(x, y float64) bool {
	rm, capR := (rIn+rOut)/2, (rOut-rIn)/2
	end := dialStart + sweep
	ex0, ey0 := c-math.Sin(dialStart)*rm, c+math.Cos(dialStart)*rm
	ex1, ey1 := c-math.Sin(end)*rm, c+math.Cos(end)*rm
	return func(x, y float64) bool {
		dx, dy := x-c, y-c
		d2 := dx*dx + dy*dy
		if d2 < rIn*rIn || d2 > rOut*rOut {
			return false
		}
		ang := math.Atan2(-dx, dy)
		if ang < 0 {
			ang += 2 * math.Pi
		}
		if ang >= dialStart && ang <= end {
			return true
		}
		return (x-ex0)*(x-ex0)+(y-ey0)*(y-ey0) <= capR*capR || (x-ex1)*(x-ex1)+(y-ey1)*(y-ey1) <= capR*capR
	}
}

func drawRingShapeDial(base *image.NRGBA, r image.Rectangle, a ringShapeArt) {
	c := float64(r.Dx()) / 2
	fillShapeAA(base, r, ringShapeDark, func(x, y float64) bool {
		dx, dy := x-c, y-c
		return dx*dx+dy*dy <= c*c
	})
	rOut, rIn := c*0.93, c*0.79
	fillShapeAA(base, r, ringShapeDim, dialArc(c, rIn, rOut, dialSweep))
	if frac := math.Min(math.Max(a.frac, 0), 1); frac > 0 {
		fillShapeAA(base, r, shapeFill(a), dialArc(c, rIn, rOut, dialSweep*frac))
	}
	drawCentredLabel(base, a.face, r.Min.X+r.Dx()/2, r.Min.Y+r.Dy()/2, ringShapeWhite, a.label)
}
