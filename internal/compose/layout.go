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

// place positions a w×h box anchored at the given corner ("tl", "tr", "bl",
// "br"), then shifts it along the vertical axis — away from the anchored edge —
// until it no longer collides with previously reserved rectangles. The chosen
// rectangle is reserved and returned.
//
// edgeX/edgeY are the inset from the image edges; gap is the minimum spacing
// kept between the placed box and any box it would otherwise overlap. A nil
// tracker simply returns the anchored rectangle without collision handling.
func (o *occupancy) place(corner string, w, h, edgeX, edgeY, gap int) image.Rectangle {
	b := o.boundsOrZero()
	var x, y int
	switch corner {
	case "tl":
		x, y = b.Min.X+edgeX, b.Min.Y+edgeY
	case "tr":
		x, y = b.Max.X-edgeX-w, b.Min.Y+edgeY
	case "bl":
		x, y = b.Min.X+edgeX, b.Max.Y-edgeY-h
	default: // "br"
		x, y = b.Max.X-edgeX-w, b.Max.Y-edgeY-h
	}
	r := image.Rect(x, y, x+w, y+h)
	if o == nil {
		return r
	}

	// Stack away from the anchored edge: top corners push downward, bottom
	// corners push upward. Iterate because one shift can introduce a new
	// overlap with a different reserved rectangle.
	towardTop := corner == "tl" || corner == "tr"
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
	o.reserve(r)
	return r
}

func (o *occupancy) boundsOrZero() image.Rectangle {
	if o == nil {
		return image.Rectangle{}
	}
	return o.bounds
}
