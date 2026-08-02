package compose

import (
	"image"
	"image/color"
	"math"
	"strconv"
	"sync"
)

// Genre icons are defined as vector primitives on a 24x24 grid and rasterised
// with supersampled coverage, so they stay crisp at any badge size without
// needing bundled artwork.
const genreIconViewBox = 24.0

// iconPrim reports whether a point on the 24x24 grid is inside the shape.
type iconPrim interface {
	covers(x, y float64) bool
}

// iconShape is one primitive plus how it is painted. Shapes paint in order.
type iconShape struct {
	prim  iconPrim
	dark  bool    // punch out with the badge-dark colour instead of the accent
	alpha float64 // 0..1, defaults to 1 when zero
}

type ipPoly struct{ pts [][2]float64 }

func (p ipPoly) covers(x, y float64) bool {
	in := false
	n := len(p.pts)
	for i, j := 0, n-1; i < n; j, i = i, i+1 {
		xi, yi := p.pts[i][0], p.pts[i][1]
		xj, yj := p.pts[j][0], p.pts[j][1]
		if (yi > y) != (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi {
			in = !in
		}
	}
	return in
}

type ipCircle struct{ cx, cy, r float64 }

func (c ipCircle) covers(x, y float64) bool {
	return math.Hypot(x-c.cx, y-c.cy) <= c.r
}

type ipRing struct{ cx, cy, r, w float64 }

func (c ipRing) covers(x, y float64) bool {
	return math.Abs(math.Hypot(x-c.cx, y-c.cy)-c.r) <= c.w/2
}

type ipEllipseRing struct{ cx, cy, rx, ry, rotDeg, w float64 }

func (e ipEllipseRing) covers(x, y float64) bool {
	t := e.rotDeg * math.Pi / 180
	dx, dy := x-e.cx, y-e.cy
	px := dx*math.Cos(-t) - dy*math.Sin(-t)
	py := dx*math.Sin(-t) + dy*math.Cos(-t)
	d := math.Hypot(px/e.rx, py/e.ry)
	// Scale the normalised distance back to grid units so the stroke reads at
	// a constant width rather than stretching with the axes.
	return math.Abs(d-1)*math.Min(e.rx, e.ry) <= e.w/2
}

type ipSeg struct{ x1, y1, x2, y2, w float64 }

func (s ipSeg) covers(x, y float64) bool {
	return distToSegment(x, y, ptf{s.x1, s.y1}, ptf{s.x2, s.y2}) <= s.w/2
}

// ipPolyStroke strokes a polyline, optionally closing it back to the start.
type ipPolyStroke struct {
	pts    [][2]float64
	w      float64
	closed bool
}

func (p ipPolyStroke) covers(x, y float64) bool {
	n := len(p.pts)
	last := n - 1
	if p.closed {
		last = n
	}
	for i := 0; i < last; i++ {
		a := p.pts[i]
		b := p.pts[(i+1)%n]
		if distToSegment(x, y, ptf{a[0], a[1]}, ptf{b[0], b[1]}) <= p.w/2 {
			return true
		}
	}
	return false
}

// ipArc strokes the arc between two angles, in degrees, measured clockwise from
// the positive x axis (y grows downward, as in the source artwork).
type ipArc struct{ cx, cy, r, a0, a1, w float64 }

func (a ipArc) covers(x, y float64) bool {
	dx, dy := x-a.cx, y-a.cy
	if math.Abs(math.Hypot(dx, dy)-a.r) > a.w/2 {
		return false
	}
	ang := math.Atan2(dy, dx) * 180 / math.Pi
	if ang < 0 {
		ang += 360
	}
	lo, hi := a.a0, a.a1
	if lo <= hi {
		return ang >= lo && ang <= hi
	}
	return ang >= lo || ang <= hi
}

type ipRRect struct{ x, y, w, h, r float64 }

func (r ipRRect) covers(px, py float64) bool { return sdRoundRect(px, py, r) <= 0 }

type ipRRectOutline struct {
	x, y, w, h, r, sw float64
}

func (o ipRRectOutline) covers(px, py float64) bool {
	d := sdRoundRect(px, py, ipRRect{o.x, o.y, o.w, o.h, o.r})
	return math.Abs(d) <= o.sw/2
}

// sdRoundRect is the signed distance from a point to a rounded rectangle:
// negative inside, positive outside.
func sdRoundRect(px, py float64, r ipRRect) float64 {
	cx, cy := r.x+r.w/2, r.y+r.h/2
	hw, hh := r.w/2, r.h/2
	qx := math.Abs(px-cx) - (hw - r.r)
	qy := math.Abs(py-cy) - (hh - r.r)
	return math.Min(math.Max(qx, qy), 0) + math.Hypot(math.Max(qx, 0), math.Max(qy, 0)) - r.r
}

// genreIconShapes returns the drawing recipe for a family, falling back to the
// film-strip shape used for unrecognised genres.
func genreIconShapes(familyID string) []iconShape {
	switch familyID {
	case "anime":
		return []iconShape{{prim: ipPoly{[][2]float64{
			{12, 2}, {14.8, 9.2}, {22, 12}, {14.8, 14.8}, {12, 22}, {9.2, 14.8}, {2, 12}, {9.2, 9.2},
		}}, alpha: 0.96}}
	case "animation":
		return []iconShape{
			{prim: ipRRectOutline{4.1, 5.3, 15.8, 13.4, 2.4, 1.9}},
			{prim: ipPoly{[][2]float64{{9.4, 8.4}, {15.9, 12}, {9.4, 15.6}}}, alpha: 0.96},
			{prim: ipCircle{6.2, 8.2, 0.8}}, {prim: ipCircle{17.8, 8.2, 0.8}},
			{prim: ipCircle{6.2, 15.8, 0.8}}, {prim: ipCircle{17.8, 15.8, 0.8}},
		}
	case "horror":
		skull := [][2]float64{{4, 10.9}}
		// Dome: a half circle swept over the top of the skull.
		for a := 180.0; a >= 0; a -= 12 {
			rad := a * math.Pi / 180
			skull = append(skull, [2]float64{12 + 8*math.Cos(rad), 10.9 - 8*math.Sin(rad)})
		}
		skull = append(skull, [][2]float64{
			{17.6, 16.6}, {17.6, 20}, {14.6, 20}, {14.6, 18}, {13.6, 18},
			{13.6, 20}, {10.6, 20}, {10.6, 18}, {9, 18}, {9, 20}, {6, 20}, {6, 16.6},
		}...)
		return []iconShape{
			{prim: ipPoly{skull}, alpha: 0.96},
			{prim: ipCircle{9, 11, 1.5}, dark: true},
			{prim: ipCircle{15, 11, 1.5}, dark: true},
			{prim: ipRRect{10.4, 14.6, 3.2, 2.2, 1.1}, dark: true},
		}
	case "comedy":
		return []iconShape{
			{prim: ipRing{12, 12, 8.6, 2.1}},
			{prim: ipCircle{9.1, 10.1, 1.1}}, {prim: ipCircle{14.9, 10.1, 1.1}},
			{prim: ipArc{12, 12.6, 4.38, 23, 157, 2}},
		}
	case "romance":
		return []iconShape{
			{prim: ipCircle{8.1, 8.5, 4.6}, alpha: 0.97},
			{prim: ipCircle{15.9, 8.5, 4.6}, alpha: 0.97},
			{prim: ipPoly{[][2]float64{{3.6, 9.9}, {20.4, 9.9}, {12, 20.2}}}, alpha: 0.97},
		}
	case "action":
		return []iconShape{{prim: ipPoly{[][2]float64{
			{13.8, 2}, {6.9, 12}, {10.9, 12}, {9.8, 22}, {17.1, 12}, {13.1, 12},
		}}, alpha: 0.97}}
	case "scifi":
		return []iconShape{
			{prim: ipEllipseRing{12, 12, 8.8, 4.4, -24, 1.9}},
			{prim: ipCircle{12, 12, 3.2}, alpha: 0.92},
			{prim: ipCircle{18.2, 8.8, 1.4}},
		}
	case "fantasy":
		return []iconShape{
			{prim: ipPoly{[][2]float64{
				{12, 3}, {15.1, 6.1}, {13.1, 8.1}, {13.1, 14.9}, {15, 16.8}, {13.8, 18},
				{12, 16.2}, {10.2, 18}, {9, 16.8}, {10.9, 14.9}, {10.9, 8.1}, {8.9, 6.1},
			}}, alpha: 0.96},
			{prim: ipRRect{7, 13.8, 10, 2.2, 1.1}},
		}
	case "crime":
		return []iconShape{
			{prim: ipPolyStroke{pts: [][2]float64{
				{12, 3}, {18.3, 5.7}, {18.3, 11}, {12, 20.1}, {5.7, 11}, {5.7, 5.7},
			}, w: 2, closed: true}},
			{prim: ipSeg{9, 10.2, 15, 10.2, 1.8}},
			{prim: ipSeg{9, 13.8, 15, 13.8, 1.8}},
		}
	case "drama":
		return []iconShape{
			{prim: ipRRectOutline{12.4, 6.2, 6.4, 12.2, 3.1, 1.8}},
			{prim: ipCircle{15.6, 10.8, 0.9}}, {prim: ipCircle{18, 10.8, 0.9}},
			{prim: ipRRectOutline{5.4, 5.1, 8.8, 14.1, 4.2, 1.8}},
			{prim: ipCircle{8.2, 10.3, 1}}, {prim: ipCircle{11.4, 10.3, 1}},
			{prim: ipArc{9.8, 12.6, 3, 30, 150, 1.7}},
		}
	case "documentary":
		return []iconShape{
			{prim: ipRRectOutline{4, 7, 12, 9.5, 2, 2}},
			{prim: ipRRect{8, 4.5, 4.4, 2.7, 1.2}},
			{prim: ipCircle{10, 11.8, 2.1}},
			{prim: ipPoly{[][2]float64{{16, 9.2}, {20.5, 7.1}, {20.5, 16.5}, {16, 14.4}}}, alpha: 0.96},
		}
	case "music":
		return []iconShape{
			{prim: ipPolyStroke{pts: [][2]float64{{9, 18}, {9, 7.5}, {18, 5}, {18, 15}}, w: 1.9}},
			{prim: ipCircle{6.5, 18, 2.5}, alpha: 0.94},
			{prim: ipCircle{15.5, 15, 2.5}, alpha: 0.94},
		}
	case "reality":
		return []iconShape{
			{prim: ipRing{12, 12, 8, 1.9}},
			{prim: ipRing{12, 12, 5, 1.6}},
			{prim: ipCircle{12, 12, 2}, alpha: 0.95},
		}
	case "family":
		return []iconShape{
			{prim: ipPolyStroke{pts: [][2]float64{
				{4, 21}, {4, 20}, {5.2, 17.2}, {8, 16}, {16, 16}, {18.8, 17.2}, {20, 20}, {20, 21},
			}, w: 1.8}},
			{prim: ipRing{12, 8, 4, 1.8}},
		}
	case "history":
		return []iconShape{
			{prim: ipRing{12, 12, 8.5, 1.9}},
			{prim: ipPolyStroke{pts: [][2]float64{{12, 6.5}, {12, 12}, {16, 14.5}}, w: 2}},
		}
	case "kids":
		return []iconShape{{prim: ipPoly{[][2]float64{
			{12, 3}, {14.5, 8.5}, {20, 9.5}, {16, 13.7}, {17, 19.5},
			{12, 17}, {7, 19.5}, {8, 13.7}, {4, 9.5}, {9.5, 8.5},
		}}, alpha: 0.95}}
	case "news":
		return []iconShape{
			{prim: ipRRectOutline{4, 5, 16, 14, 2, 1.9}},
			{prim: ipSeg{8, 9, 16, 9, 1.8}},
			{prim: ipSeg{8, 12.5, 13, 12.5, 1.8}},
			{prim: ipRRect{15, 12, 3, 3, 0.6}, alpha: 0.9},
		}
	case "soap":
		return []iconShape{
			{prim: ipEllipseRing{12, 12, 5, 9, 0, 1.9}},
			{prim: ipCircle{10.5, 9, 1.2}, alpha: 0.6},
			{prim: ipCircle{13, 12, 0.9}, alpha: 0.5},
		}
	case "talk":
		return []iconShape{
			{prim: ipPolyStroke{pts: [][2]float64{
				{4, 6}, {20, 6}, {20, 16}, {8, 16}, {4, 19},
			}, w: 1.9, closed: true}},
			{prim: ipCircle{9, 11, 1.1}}, {prim: ipCircle{12, 11, 1.1}}, {prim: ipCircle{15, 11, 1.1}},
		}
	case "tvmovie":
		return []iconShape{
			{prim: ipRRectOutline{3.5, 5, 17, 12, 2, 1.9}},
			{prim: ipSeg{8, 20, 16, 20, 1.8}},
			{prim: ipSeg{12, 17, 12, 20, 1.8}},
		}
	case "warpolitics":
		return []iconShape{
			{prim: ipSeg{6, 3, 6, 21, 2}},
			{prim: ipPoly{[][2]float64{{6, 4}, {17, 4}, {14, 8}, {17, 12}, {6, 12}}}, alpha: 0.94},
		}
	}
	// Film strip: the fallback for unrecognised genres.
	return []iconShape{
		{prim: ipRRectOutline{4, 5, 16, 14, 2, 1.9}},
		{prim: ipRRect{4, 5, 5.3, 14, 2}, alpha: 0.25},
		{prim: ipRRect{14.7, 5, 5.3, 14, 2}, alpha: 0.25},
		{prim: ipCircle{12, 12, 2.2}, alpha: 0.9},
	}
}

// genreIconSubsamples is the supersampling grid used per pixel; 4x4 keeps the
// small shapes smooth without a meaningful cost at badge sizes.
const genreIconSubsamples = 4

// shapeCoverage is one shape's per-pixel coverage over a size x size box, with
// the colour choice that shape makes. float32 halves the cache against float64
// and still round-trips to the same uint8 alpha.
type shapeCoverage struct {
	dark  bool
	alpha float64
	cov   []float32
}

// genreIconCoverage caches the expensive half of drawing a glyph. Coverage is
// fixed by family and size, and the outline redraws the same glyph up to 25
// times for one badge, so rasterising per draw repeated identical work.
//
// An entry costs shapes x size^2 float32, and size follows the badge scale,
// which users set anywhere from 70 to 300 percent across several surfaces. A
// public instance serving many profiles walks that space, so the cache is held
// to a byte budget rather than left to grow: this service runs under a 512MB
// default limit and has been OOMed by catalogue bursts before.
const genreIconCacheBudgetBytes = 32 << 20

var (
	genreIconCacheMu    sync.RWMutex
	genreIconCache      = map[string][]shapeCoverage{}
	genreIconCacheBytes int
)

func genreIconCoverageFor(familyID string, size int) []shapeCoverage {
	key := familyID + "|" + strconv.Itoa(size)
	genreIconCacheMu.RLock()
	cached, ok := genreIconCache[key]
	genreIconCacheMu.RUnlock()
	if ok {
		return cached
	}

	built := buildGenreIconCoverage(familyID, size)
	cost := 0
	for _, sh := range built {
		cost += len(sh.cov) * 4
	}

	genreIconCacheMu.Lock()
	defer genreIconCacheMu.Unlock()
	// Two renders can miss the same key at once and both build it. Counting the
	// second one's cost against a map that holds a single entry drifts the total
	// above what is really held, flushing earlier than the budget requires.
	if existing, ok := genreIconCache[key]; ok {
		return existing
	}
	// Dropping everything is cruder than evicting least-recently-used, and it is
	// enough: a rebuild is one rasterisation per glyph actually in use, and at
	// this budget a real instance never reaches it.
	if genreIconCacheBytes+cost > genreIconCacheBudgetBytes {
		genreIconCache = map[string][]shapeCoverage{}
		genreIconCacheBytes = 0
	}
	genreIconCache[key] = built
	genreIconCacheBytes += cost
	return built
}

func buildGenreIconCoverage(familyID string, size int) []shapeCoverage {
	shapes := genreIconShapes(familyID)
	scale := float64(size) / genreIconViewBox
	step := 1.0 / float64(genreIconSubsamples)
	weight := 1.0 / float64(genreIconSubsamples*genreIconSubsamples)

	out := make([]shapeCoverage, 0, len(shapes))
	for _, sh := range shapes {
		alpha := sh.alpha
		if alpha == 0 {
			alpha = 1
		}
		cov := make([]float32, size*size)
		for py := 0; py < size; py++ {
			for px := 0; px < size; px++ {
				c := 0.0
				for sy := 0; sy < genreIconSubsamples; sy++ {
					for sx := 0; sx < genreIconSubsamples; sx++ {
						gx := (float64(px) + (float64(sx)+0.5)*step) / scale
						gy := (float64(py) + (float64(sy)+0.5)*step) / scale
						if sh.prim.covers(gx, gy) {
							c += weight
						}
					}
				}
				cov[py*size+px] = float32(c)
			}
		}
		out = append(out, shapeCoverage{dark: sh.dark, alpha: alpha, cov: cov})
	}
	return out
}

// drawGenreIcon rasterises a family's icon into a size x size box at (x, y),
// tinted with the family accent. darkCol punches out the interior details.
// Shapes are blended in order, so an overlap compounds exactly as it did when
// the coverage was computed inline.
func drawGenreIcon(dst *image.NRGBA, familyID string, accent color.NRGBA, darkCol color.NRGBA, x, y, size int) {
	if size <= 0 {
		return
	}
	for _, sh := range genreIconCoverageFor(familyID, size) {
		col := accent
		if sh.dark {
			col = darkCol
		}
		for py := 0; py < size; py++ {
			for px := 0; px < size; px++ {
				cov := float64(sh.cov[py*size+px])
				if cov <= 0 {
					continue
				}
				c := col
				c.A = uint8(math.Round(float64(col.A) * sh.alpha * cov))
				if c.A == 0 {
					continue
				}
				blendPixel(dst, x+px, y+py, c)
			}
		}
	}
}

// drawGenreIconOutline traces a family glyph in one flat colour before the glyph
// itself is drawn, so a mark on the plain style carries the same edge its label
// does. A glow fades the trace outward over the same radius.
func drawGenreIconOutline(dst *image.NRGBA, familyID string, outline color.NRGBA, x, y, size, width int, glow bool) {
	if size <= 0 || width <= 0 || outline.A == 0 {
		return
	}
	for dx := -width; dx <= width; dx++ {
		for dy := -width; dy <= width; dy++ {
			if dx == 0 && dy == 0 {
				continue
			}
			col := outline
			if glow {
				d := math.Hypot(float64(dx), float64(dy)) / (float64(width) + 1)
				if d > 1 {
					continue
				}
				col.A = uint8(float64(outline.A) * (1 - d) * 0.85)
				if col.A == 0 {
					continue
				}
			}
			drawGenreIcon(dst, familyID, col, col, x+dx, y+dy, size)
		}
	}
}
