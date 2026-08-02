package compose

import "image"

// occupancy tracks rectangles already claimed by overlays so that
// corner-anchored overlays (quality badges, age/genre badges, the trending
// tag and the average-rating ring) can be placed without drawing on top of
// one another. Each overlay reserves the region it occupies; subsequent
// overlays consult the tracker and shift away from collisions.
type occupancy struct {
	bounds image.Rectangle
	rects  []image.Rectangle
}

// newOccupancy returns a tracker scoped to the image bounds.
func newOccupancy(b image.Rectangle) *occupancy { return &occupancy{bounds: b} }

// reserve records r as occupied. Empty rectangles are ignored.
func (o *occupancy) reserve(r image.Rectangle) {
	if o == nil || r.Empty() {
		return
	}
	o.rects = append(o.rects, r)
}

// overlaps reports whether r intersects any reserved rectangle.
func (o *occupancy) overlaps(r image.Rectangle) bool {
	if o == nil {
		return false
	}
	for _, e := range o.rects {
		if e.Overlaps(r) {
			return true
		}
	}
	return false
}

// freeWidthAt reports the horizontal room an h-tall box has on the row it would
// anchor to for the given corner, stopping at whatever is already reserved on
// the side it grows toward. An overlay that can shrink asks before it is
// placed: place only ever shifts a box that does not fit, so a strip measured
// against the full frame slides off its row instead of narrowing to the gap.
//
// A reservation covering the anchor itself reports the full width. There is no
// room to trim into there, and shifting is the right answer.
func (o *occupancy) freeWidthAt(corner string, h, edgeX, edgeY, gap int) int {
	b := o.boundsOrZero()
	full := b.Dx() - edgeX*2
	if o == nil || len(o.rects) == 0 || full <= 0 {
		return full
	}

	y0 := b.Max.Y - edgeY - h
	if corner == "tl" || corner == "tr" || corner == "tc" {
		y0 = b.Min.Y + edgeY
	}
	y1 := y0 + h

	lo, hi := b.Min.X+edgeX, b.Max.X-edgeX
	anchor := lo
	switch corner {
	case "tr", "br":
		anchor = hi - 1
	case "tc", "bc":
		anchor = b.Min.X + b.Dx()/2
	}

	for _, e := range o.rects {
		if e.Empty() || e.Max.Y <= y0 || e.Min.Y >= y1 {
			continue // a different row
		}
		left, right := e.Min.X-gap, e.Max.X+gap
		switch {
		case right <= anchor:
			if right > lo {
				lo = right
			}
		case left > anchor:
			if left < hi {
				hi = left
			}
		default:
			return full
		}
	}
	if hi-lo < 0 {
		return 0
	}
	return hi - lo
}

// place positions a w×h box anchored at the given position, then shifts it
// along the vertical axis — away from the anchored edge — until it no longer
// collides with previously reserved rectangles. The chosen rectangle is
// reserved and returned. Positions: the four corners "tl"/"tr"/"bl"/"br" and the
// horizontal-centre variants "tc" (top) and "bc" (bottom); an unknown value
// falls back to "br".
//
// edgeX/edgeY are the inset from the image edges; gap is the minimum spacing
// kept between the placed box and any box it would otherwise overlap. A nil
// tracker simply returns the anchored rectangle without collision handling.
func (o *occupancy) place(corner string, w, h, edgeX, edgeY, gap int) image.Rectangle {
	b := o.boundsOrZero()
	centreX := b.Min.X + (b.Dx()-w)/2
	var x, y int
	switch corner {
	case "tl":
		x, y = b.Min.X+edgeX, b.Min.Y+edgeY
	case "tr":
		x, y = b.Max.X-edgeX-w, b.Min.Y+edgeY
	case "tc":
		x, y = centreX, b.Min.Y+edgeY
	case "bl":
		x, y = b.Min.X+edgeX, b.Max.Y-edgeY-h
	case "bc":
		x, y = centreX, b.Max.Y-edgeY-h
	default: // "br"
		x, y = b.Max.X-edgeX-w, b.Max.Y-edgeY-h
	}
	r := image.Rect(x, y, x+w, y+h)
	if o == nil {
		return r
	}
	towardTop := corner == "tl" || corner == "tr" || corner == "tc"
	r = o.resolve(r, towardTop, gap)
	o.reserve(r)
	return r
}

// placeCentered positions a w×h box horizontally centred, anchored edgeY above
// the bottom edge, then shifts it upward until it clears previously reserved
// rectangles. The chosen rectangle is reserved and returned. Used for wide
// bottom strips (provider chips) that are not corner-anchored.
func (o *occupancy) placeCentered(w, h, edgeX, edgeY, gap int) image.Rectangle {
	b := o.boundsOrZero()
	x := b.Min.X + (b.Dx()-w)/2
	if x < b.Min.X+edgeX {
		x = b.Min.X + edgeX
	}
	r := image.Rect(x, b.Max.Y-edgeY-h, x+w, b.Max.Y-edgeY)
	if o == nil {
		return r
	}
	r = o.resolve(r, false, gap)
	o.reserve(r)
	return r
}

// resolve shifts r along the vertical axis (down when towardTop, up otherwise)
// until it no longer collides with reserved rectangles. Iterates because one
// shift can introduce a new overlap with a different reserved rectangle.
func (o *occupancy) resolve(r image.Rectangle, towardTop bool, gap int) image.Rectangle {
	// Stack away from the anchored edge: top-anchored boxes push downward,
	// bottom-anchored boxes push upward.
	for i := 0; i < 16 && o.overlaps(r); i++ {
		shift := 0
		for _, e := range o.rects {
			if !e.Overlaps(r) {
				continue
			}
			var d int
			if towardTop {
				d = e.Max.Y - r.Min.Y + gap // move down, clearing e's bottom
			} else {
				d = r.Max.Y - e.Min.Y + gap // move up, clearing e's top
			}
			if d > shift {
				shift = d
			}
		}
		if shift <= 0 {
			break
		}
		if towardTop {
			r = r.Add(image.Pt(0, shift))
		} else {
			r = r.Sub(image.Pt(0, shift))
		}
	}
	return r
}

func (o *occupancy) boundsOrZero() image.Rectangle {
	if o == nil {
		return image.Rectangle{}
	}
	return o.bounds
}
