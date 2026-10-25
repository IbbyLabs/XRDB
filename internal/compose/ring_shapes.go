package compose

import (
	"image"
	"image/color"
	"math"

	"golang.org/x/image/font"
)

// ringShapeArt is what a shape needs to draw one rating-ring badge.
type ringShapeArt struct {
	fill  color.NRGBA // score colour, or the placeholder colour
	face  font.Face   // the ring's value face
	small font.Face   // secondary text, such as the verdict word
	label string      // the score, "N/A", or empty
	word  string      // verdict word; empty for an empty badge
	empty bool
}

// ringShape sizes and draws one alternative to the progress ring. outerR is the
// ring's radius at the current scale, so every shape tracks Ring size.
type ringShape struct {
	size func(outerR int, a ringShapeArt) (w, h int)
	draw func(base *image.NRGBA, r image.Rectangle, a ringShapeArt)
}

var ringShapeDrawers = map[string]ringShape{
	"disc":    {size: squareRingShape(1), draw: drawRingShapeDisc},
	"chip":    {size: chipRingShapeSize, draw: drawRingShapeChip},
	"hexagon": {size: squareRingShape(1.08), draw: drawRingShapeHexagon},
	"shield":  {size: shieldRingShapeSize, draw: drawRingShapeShield},
	"verdict": {size: verdictRingShapeSize, draw: drawRingShapeVerdict},
}

var (
	ringShapeInk   = color.NRGBA{R: 17, G: 17, B: 17, A: 255}
	ringShapeWhite = color.NRGBA{R: 248, G: 250, B: 252, A: 255}
	ringShapeDark  = color.NRGBA{R: 8, G: 11, B: 16, A: 225}
	ringShapeTrack = color.NRGBA{R: 120, G: 124, B: 132, A: 210}
)

// ringVerdictWord names a 0-10 score in four bands.
func ringVerdictWord(v float64, lang string) string {
	switch {
	case v >= 8:
		return UIString("verdict_great", lang, "Great")
	case v >= 7.5:
		return UIString("verdict_good", lang, "Good")
	case v >= 6:
		return UIString("verdict_mixed", lang, "Mixed")
	default:
		return UIString("verdict_poor", lang, "Poor")
	}
}

func squareRingShape(k float64) func(int, ringShapeArt) (int, int) {
	return func(outerR int, _ ringShapeArt) (int, int) {
		d := int(float64(outerR)*2*k + 0.5)
		return d, d
	}
}

func chipRingShapeSize(outerR int, a ringShapeArt) (int, int) {
	h := int(float64(outerR)*1.6 + 0.5)
	w := int(math.Max(float64(h)*1.3, float64(textWidth(a.face, a.label))+float64(h)*0.7) + 0.5)
	return w, h
}

func shieldRingShapeSize(outerR int, _ ringShapeArt) (int, int) {
	return int(float64(outerR)*1.8 + 0.5), int(float64(outerR)*2.1 + 0.5)
}

func verdictRingShapeSize(outerR int, a ringShapeArt) (int, int) {
	h := int(float64(outerR)*1.35 + 0.5)
	w := h/2 + h/3 + textWidth(a.face, a.label) + h/2
	if a.word != "" && a.small != nil {
		w += h/4 + textWidth(a.small, a.word)
	}
	return w, h
}

// inkOn picks dark or light text for a solid score-coloured fill.
func inkOn(c color.NRGBA) color.NRGBA {
	if 0.2126*float64(c.R)+0.7152*float64(c.G)+0.0722*float64(c.B) > 110 {
		return ringShapeInk
	}
	return ringShapeWhite
}

func shapeFill(a ringShapeArt) color.NRGBA {
	if a.empty && a.fill.A == 0 {
		return ringShapeTrack
	}
	return a.fill
}

// drawCentredLabel draws s centred on (cx, cy).
func drawCentredLabel(base *image.NRGBA, face font.Face, cx, cy int, c color.NRGBA, s string) {
	if face == nil || s == "" {
		return
	}
	fm := face.Metrics()
	drawText(base, face, cx-textWidth(face, s)/2, cy+(fm.Ascent.Ceil()-fm.Descent.Ceil())/2, c, s)
}

// fillShapeAA fills the pixels of r whose area lies inside the shape, with 4x4
// supersampling for smooth edges. inside takes coordinates relative to r.Min.
func fillShapeAA(base *image.NRGBA, r image.Rectangle, c color.NRGBA, inside func(x, y float64) bool) {
	const n = 4
	b := r.Intersect(base.Bounds())
	for py := b.Min.Y; py < b.Max.Y; py++ {
		for px := b.Min.X; px < b.Max.X; px++ {
			hits := 0
			for sy := 0; sy < n; sy++ {
				for sx := 0; sx < n; sx++ {
					if inside(float64(px-r.Min.X)+(float64(sx)+0.5)/n, float64(py-r.Min.Y)+(float64(sy)+0.5)/n) {
						hits++
					}
				}
			}
			if hits == 0 {
				continue
			}
			blendPixel(base, px, py, color.NRGBA{R: c.R, G: c.G, B: c.B, A: uint8(int(c.A) * hits / (n * n))})
		}
	}
}

type ptPoly []ptf

// inside is the even-odd test against the closed polygon.
func (p ptPoly) inside(x, y float64) bool {
	in := false
	for i, j := 0, len(p)-1; i < len(p); j, i = i, i+1 {
		if (p[i].y > y) != (p[j].y > y) && x < (p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x {
			in = !in
		}
	}
	return in
}

// shrink scales the polygon towards (cx, cy), for the inner face of an outlined shape.
func (p ptPoly) shrink(cx, cy, k float64) ptPoly {
	out := make(ptPoly, len(p))
	for i, q := range p {
		out[i] = ptf{x: cx + (q.x-cx)*k, y: cy + (q.y-cy)*k}
	}
	return out
}

func drawRingShapeDisc(base *image.NRGBA, r image.Rectangle, a ringShapeArt) {
	fill := shapeFill(a)
	rad := float64(r.Dx()) / 2
	fillShapeAA(base, r, fill, func(x, y float64) bool {
		dx, dy := x-rad, y-rad
		return dx*dx+dy*dy <= rad*rad
	})
	drawCentredLabel(base, a.face, r.Min.X+r.Dx()/2, r.Min.Y+r.Dy()/2, inkOn(fill), a.label)
}

func drawRingShapeChip(base *image.NRGBA, r image.Rectangle, a ringShapeArt) {
	fill := shapeFill(a)
	blendRoundedRect(base, r, int(float64(r.Dy())*0.22+0.5), fill)
	drawCentredLabel(base, a.face, r.Min.X+r.Dx()/2, r.Min.Y+r.Dy()/2, inkOn(fill), a.label)
}

func hexagonPoly(w, h float64) ptPoly {
	cx, cy, rad := w/2, h/2, math.Min(w, h)/2
	p := make(ptPoly, 6)
	for i := range p {
		t := math.Pi/2 + float64(i)*math.Pi/3
		p[i] = ptf{x: cx + rad*math.Cos(t), y: cy - rad*math.Sin(t)}
	}
	return p
}

func drawRingShapeHexagon(base *image.NRGBA, r image.Rectangle, a ringShapeArt) {
	fill := shapeFill(a)
	fillShapeAA(base, r, fill, hexagonPoly(float64(r.Dx()), float64(r.Dy())).inside)
	drawCentredLabel(base, a.face, r.Min.X+r.Dx()/2, r.Min.Y+r.Dy()/2, inkOn(fill), a.label)
}

func shieldPoly(w, h float64) ptPoly {
	p := ptPoly{{x: 0, y: h * 0.1}, {x: w / 2, y: 0}, {x: w, y: h * 0.1}, {x: w, y: h * 0.5}}
	// The lower edge curves from each side into the point.
	const steps = 8
	for i := 1; i <= steps; i++ {
		t := float64(i) / steps
		p = append(p, ptf{x: w - (w/2)*t*t, y: h*0.5 + (h*0.5)*(2*t-t*t)})
	}
	for i := steps - 1; i >= 1; i-- {
		t := float64(i) / steps
		p = append(p, ptf{x: (w / 2) * t * t, y: h*0.5 + (h*0.5)*(2*t-t*t)})
	}
	return append(p, ptf{x: 0, y: h * 0.5})
}

func drawRingShapeShield(base *image.NRGBA, r image.Rectangle, a ringShapeArt) {
	w, h := float64(r.Dx()), float64(r.Dy())
	outer := shieldPoly(w, h)
	fillShapeAA(base, r, shapeFill(a), outer.inside)
	fillShapeAA(base, r, color.NRGBA{R: ringShapeDark.R, G: ringShapeDark.G, B: ringShapeDark.B, A: 255}, outer.shrink(w/2, h*0.45, 0.8).inside)
	drawCentredLabel(base, a.face, r.Min.X+r.Dx()/2, r.Min.Y+int(h*0.44), ringShapeWhite, a.label)
}

func drawRingShapeVerdict(base *image.NRGBA, r image.Rectangle, a ringShapeArt) {
	h := r.Dy()
	fill := shapeFill(a)
	blendRoundedRect(base, r, h/2, ringShapeDark)
	dotR := float64(h) / 6
	dot := image.Rect(r.Min.X+h/2-int(dotR), r.Min.Y+h/2-int(dotR), r.Min.X+h/2+int(dotR+0.5), r.Min.Y+h/2+int(dotR+0.5))
	fillShapeAA(base, dot, fill, func(x, y float64) bool {
		dx, dy := x-float64(dot.Dx())/2, y-float64(dot.Dy())/2
		return dx*dx+dy*dy <= dotR*dotR
	})
	if a.face == nil {
		return
	}
	x := r.Min.X + h/2 + h/3
	fm := a.face.Metrics()
	baseline := r.Min.Y + h/2 + (fm.Ascent.Ceil()-fm.Descent.Ceil())/2
	drawText(base, a.face, x, baseline, ringShapeWhite, a.label)
	if a.word != "" && a.small != nil {
		drawText(base, a.small, x+textWidth(a.face, a.label)+h/4, baseline, fill, a.word)
	}
}
