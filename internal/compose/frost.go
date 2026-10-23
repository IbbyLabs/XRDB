package compose

import (
	"encoding/binary"
	"image"
	"math"
	"sync"
)

const (
	// frostWidthFraction is the blur radius at full strength as a share of the
	// frame width, so a 4K frame blurs like a 1x one.
	frostWidthFraction = 0.006
	// frostPasses box blurs approximate a gaussian.
	frostPasses = 3
	// frostLogoStrength is the blur strength behind a title logo.
	frostLogoStrength = 60
)

// frostCall is one blur request, as the benchmarks record and replay it.
type frostCall struct {
	feathered bool
	rect      image.Rectangle
	radius    int
	feather   int
	strength  int
	square    squaredCorners
}

// frostObserver, when set, sees every blur request. Only benchmarks set it.
var frostObserver func(frostCall)

// frostRadius maps a 0-100 strength to the box radius for a frame of the given
// width. Zero or less is off.
func frostRadius(strength, frameW int) int {
	if strength <= 0 {
		return 0
	}
	if strength > 100 {
		strength = 100
	}
	r := int(math.Round(float64(strength) / 100 * float64(frameW) * frostWidthFraction))
	if r < 1 {
		r = 1
	}
	return r
}

// frostRoundedRect blurs the artwork inside the rounded rect r, with the same
// shape fillRoundedRectSquared draws, leaving every pixel outside it untouched.
func frostRoundedRect(base *image.NRGBA, r image.Rectangle, radius int, sq squaredCorners, strength int) {
	rad := frostRadius(strength, base.Bounds().Dx())
	if rad == 0 {
		return
	}
	if frostObserver != nil {
		frostObserver(frostCall{rect: r, radius: radius, strength: strength, square: sq})
	}
	r = r.Intersect(base.Bounds())
	if r.Empty() {
		return
	}
	full := roundedFullSpan(r, radius, sq)
	frostRegion(base, r, full, rad, func(x, y int) float64 {
		if sq != squareNone && onSquaredEdge(x, y, r, radius, sq) {
			return 1
		}
		cov, skip := cornerCoverage(x, y, r, radius)
		if skip {
			return 0
		}
		return cov
	})
}

// roundedFullSpan gives, for each row of the rounded rect r, the half-open span
// of columns that cornerCoverage counts as fully inside, leaving only the
// anti-aliased fringe of each corner to be measured.
func roundedFullSpan(r image.Rectangle, radius int, sq squaredCorners) func(y int) (int, int) {
	cr := float64(radius)
	inner := cr - 0.5
	return func(y int) (int, int) {
		x0, x1 := r.Min.X, r.Max.X
		var cy float64
		switch {
		case y < r.Min.Y+radius:
			cy = float64(r.Min.Y + radius)
		case y >= r.Max.Y-radius:
			cy = float64(r.Max.Y - radius)
		default:
			return x0, x1
		}
		if sq == squareTop && y < r.Min.Y+radius || sq == squareBottom && y >= r.Max.Y-radius {
			return x0, x1
		}
		dy := float64(y) + 0.5 - cy
		half := 0.0
		if inner > math.Abs(dy) {
			half = math.Sqrt(inner*inner - dy*dy)
		} else {
			return r.Min.X, r.Min.X
		}
		left := int(math.Ceil(float64(r.Min.X)+cr-half-0.5)) + 1
		right := int(math.Floor(float64(r.Max.X)-cr+half-0.5)) - 1
		if sq != squareLeft {
			x0 = left
		}
		if sq != squareRight {
			x1 = right + 1
		}
		x0, x1 = max(x0, r.Min.X), min(x1, r.Max.X)
		if x1 < x0 {
			x1 = x0
		}
		return x0, x1
	}
}

// frostFeatheredRect blurs the artwork inside r, fading the blur out over
// feather pixels on each side of the rect's outline so no edge shows.
func frostFeatheredRect(base *image.NRGBA, r image.Rectangle, feather, strength int) {
	rad := frostRadius(strength, base.Bounds().Dx())
	if rad == 0 || r.Empty() {
		return
	}
	if frostObserver != nil {
		frostObserver(frostCall{feathered: true, rect: r, feather: max(feather, 1), strength: strength})
	}
	frostFeatheredRadius(base, r, feather, rad)
}

// frostFeatheredRadius is frostFeatheredRect with the box radius given in pixels.
func frostFeatheredRadius(base *image.NRGBA, r image.Rectangle, feather, rad int) {
	if rad <= 0 || r.Empty() {
		return
	}
	if feather < 1 {
		feather = 1
	}
	area := r.Inset(-feather).Intersect(base.Bounds())
	if area.Empty() {
		return
	}
	wx := featherWeights(area.Min.X, area.Max.X, r.Min.X, r.Max.X, feather)
	wy := featherWeights(area.Min.Y, area.Max.Y, r.Min.Y, r.Max.Y, feather)
	inner := r.Inset(feather)
	full := func(y int) (int, int) {
		if y >= inner.Min.Y && y < inner.Max.Y {
			return inner.Min.X, inner.Max.X
		}
		return 0, 0
	}
	frostRegion(base, area, full, rad, func(x, y int) float64 {
		return wx[x-area.Min.X] * wy[y-area.Min.Y]
	})
}

// featherWeights is the coverage along one axis: 1 feather pixels inside
// [lo, hi), 0 feather pixels outside it, and a smoothstep between.
func featherWeights(from, to, lo, hi, feather int) []float64 {
	out := make([]float64, to-from)
	span := float64(2 * feather)
	for i := range out {
		v := float64(from + i)
		d := math.Min(v+0.5-float64(lo), float64(hi)-v-0.5)
		t := 0.5 + d/span
		switch {
		case t <= 0:
			out[i] = 0
		case t >= 1:
			out[i] = 1
		default:
			out[i] = t * t * (3 - 2*t)
		}
	}
	return out
}

// frostRegion blurs base around area and writes the result back inside area
// weighted by cov. Pixels with no coverage are not written; full gives, for a
// row, the half-open span where cov is known to be 1, so those pixels skip the
// call. The region read extends past area by the reach of the blur.
func frostRegion(base *image.NRGBA, area image.Rectangle, full func(y int) (int, int), rad int, cov func(x, y int) float64) {
	area = area.Intersect(base.Bounds())
	if area.Empty() || rad <= 0 {
		return
	}
	// The blur runs on a copy shrunk by rad, where each box pass spans a single
	// pixel, so its cost follows the area and not the radius.
	step := rad
	src := area.Inset(-2 * rad).Intersect(base.Bounds())
	w, h := src.Dx(), src.Dy()
	sw, sh := (w+step-1)/step, (h+step-1)/step
	sc := frostScratchPool.Get().(*frostScratch)
	defer frostScratchPool.Put(sc)
	a := sc.grow(&sc.a, sw*sh*4)
	b := sc.grow(&sc.b, sw*sh*4)
	downsample(base, src, step, a, sw, sh)
	sums := sc.growInts(sw * 4)
	for range frostPasses {
		blurRows(a, b, sw, sh, 1)
		blurCols(b, a, sw, sh, 1, sums)
	}

	xs := sc.axis(&sc.xAxis, area.Min.X-src.Min.X, area.Dx(), step, sw)
	rb, ga := sc.growMix(sw)
	for y := area.Min.Y; y < area.Max.Y; y++ {
		y0, y1, wy := lerpIndex(y-src.Min.Y, step, sh)
		r0 := a[y0*sw*4 : (y0+1)*sw*4]
		r1 := a[y1*sw*4 : (y1+1)*sw*4]
		for j := range rb {
			p, q := binary.LittleEndian.Uint32(r0[j*4:]), binary.LittleEndian.Uint32(r1[j*4:])
			rb[j] = lerpLanes(p&lanes, q&lanes, uint32(wy))
			ga[j] = lerpLanes(p>>8&lanes, q>>8&lanes, uint32(wy))
		}
		f0, f1 := full(y)
		f0 = min(max(f0, area.Min.X), area.Max.X)
		f1 = min(max(f1, f0), area.Max.X)

		partial := func(x0, x1 int) {
			for x := x0; x < x1; x++ {
				c := int32(cov(x, y)*256 + 0.5)
				if c <= 0 {
					continue
				}
				ax := xs[x-area.Min.X]
				v := mixLanes(rb[ax.i0], rb[ax.i1], ga[ax.i0], ga[ax.i1], uint32(ax.w))
				px := base.Pix[base.PixOffset(x, y):][:4]
				for k := range px {
					o := int32(px[k])
					px[k] = uint8(o + (int32(v>>(8*k)&0xff)-o)*c>>8)
				}
			}
		}
		partial(area.Min.X, f0)
		if f1 > f0 {
			row := base.Pix[base.PixOffset(f0, y):][: (f1-f0)*4 : (f1-f0)*4]
			span := xs[f0-area.Min.X : f1-area.Min.X]
			for i, ax := range span {
				binary.LittleEndian.PutUint32(row[i*4:], mixLanes(rb[ax.i0], rb[ax.i1], ga[ax.i0], ga[ax.i1], uint32(ax.w)))
			}
		}
		partial(f1, area.Max.X)
	}
}

// lanes selects two of a pixel's four channels, each in a 16-bit lane so a
// product with a weight out of 256 cannot spill into its neighbour.
const lanes = 0x00ff00ff

// lerpLanes blends two lane pairs, w out of 256 toward q.
func lerpLanes(p, q, w uint32) uint32 { return (p*(256-w) + q*w) >> 8 & lanes }

// mixLanes blends two pixels split into red/blue and green/alpha lanes, the
// green/alpha pair already shifted down a byte, and packs the result.
func mixLanes(rb0, rb1, ga0, ga1, w uint32) uint32 {
	rb := (rb0*(256-w) + rb1*w) >> 8 & lanes
	ga := ga0*(256-w) + ga1*w
	return rb | ga&^lanes
}

// lerpAxis is the pair of downsampled columns, and the weight between them out
// of 256, that one full-resolution column interpolates from.
type lerpAxis struct{ i0, i1, w int }

// lerpIndex gives the pair of downsampled rows, and the weight on the second
// out of 256, for full-resolution row v from the region origin.
func lerpIndex(v, step, n int) (i0, i1, w int) {
	if step == 1 {
		return v, v, 0
	}
	f := (2*v+1)*256/(2*step) - 128
	i := f >> 8
	return clampIdx(i, n), clampIdx(i+1, n), f - i<<8
}

// downsample averages step-by-step blocks of src into dst, reading a sparse
// grid of each block rather than every pixel.
func downsample(base *image.NRGBA, src image.Rectangle, step int, dst []uint8, sw, sh int) {
	stride := max(1, step/3)
	for by := 0; by < sh; by++ {
		y0, y1 := src.Min.Y+by*step, min(src.Min.Y+(by+1)*step, src.Max.Y)
		for bx := 0; bx < sw; bx++ {
			x0, x1 := src.Min.X+bx*step, min(src.Min.X+(bx+1)*step, src.Max.X)
			var s0, s1, s2, s3, n int
			for y := y0; y < y1; y += stride {
				off := base.PixOffset(x0, y)
				for x := x0; x < x1; x += stride {
					s0 += int(base.Pix[off])
					s1 += int(base.Pix[off+1])
					s2 += int(base.Pix[off+2])
					s3 += int(base.Pix[off+3])
					n++
					off += 4 * stride
				}
			}
			o := (by*sw + bx) * 4
			dst[o] = uint8(s0 / n)
			dst[o+1] = uint8(s1 / n)
			dst[o+2] = uint8(s2 / n)
			dst[o+3] = uint8(s3 / n)
		}
	}
}

type frostScratch struct {
	a, b  []uint8
	sums  []int
	xAxis []lerpAxis
	mix   []uint32
}

// growMix returns two scratch rows of n pixels.
func (s *frostScratch) growMix(n int) ([]uint32, []uint32) {
	if cap(s.mix) < 2*n {
		s.mix = make([]uint32, 2*n)
	}
	s.mix = s.mix[:2*n]
	return s.mix[:n], s.mix[n:]
}

// axis fills the column lookup for n full-resolution columns starting offset
// from the region origin.
func (s *frostScratch) axis(buf *[]lerpAxis, offset, n, step, sw int) []lerpAxis {
	if cap(*buf) < n {
		*buf = make([]lerpAxis, n)
	}
	*buf = (*buf)[:n]
	for i := range *buf {
		i0, i1, w := lerpIndex(offset+i, step, sw)
		(*buf)[i] = lerpAxis{i0, i1, w}
	}
	return *buf
}

func (s *frostScratch) grow(buf *[]uint8, n int) []uint8 {
	if cap(*buf) < n {
		*buf = make([]uint8, n)
	}
	*buf = (*buf)[:n]
	return *buf
}

func (s *frostScratch) growInts(n int) []int {
	if cap(s.sums) < n {
		s.sums = make([]int, n)
	}
	s.sums = s.sums[:n]
	return s.sums
}

var frostScratchPool = sync.Pool{New: func() any { return new(frostScratch) }}

// blurRows is one horizontal box pass from src into dst, clamping at the edges.
func blurRows(src, dst []uint8, w, h, rad int) {
	win := 2*rad + 1
	for y := 0; y < h; y++ {
		row := src[y*w*4 : (y+1)*w*4]
		out := dst[y*w*4 : (y+1)*w*4]
		var s0, s1, s2, s3 int
		for i := -rad; i <= rad; i++ {
			p := clampIdx(i, w) * 4
			s0 += int(row[p])
			s1 += int(row[p+1])
			s2 += int(row[p+2])
			s3 += int(row[p+3])
		}
		for x := 0; x < w; x++ {
			o := x * 4
			out[o] = uint8((s0 + win/2) / win)
			out[o+1] = uint8((s1 + win/2) / win)
			out[o+2] = uint8((s2 + win/2) / win)
			out[o+3] = uint8((s3 + win/2) / win)
			add := clampIdx(x+rad+1, w) * 4
			sub := clampIdx(x-rad, w) * 4
			s0 += int(row[add]) - int(row[sub])
			s1 += int(row[add+1]) - int(row[sub+1])
			s2 += int(row[add+2]) - int(row[sub+2])
			s3 += int(row[add+3]) - int(row[sub+3])
		}
	}
}

// blurCols is one vertical box pass from src into dst, clamping at the edges.
func blurCols(src, dst []uint8, w, h, rad int, sums []int) {
	win := 2*rad + 1
	stride := w * 4
	for i := range sums {
		sums[i] = 0
	}
	for i := -rad; i <= rad; i++ {
		row := src[clampIdx(i, h)*stride:]
		for k := 0; k < stride; k++ {
			sums[k] += int(row[k])
		}
	}
	for y := 0; y < h; y++ {
		out := dst[y*stride : (y+1)*stride]
		for k := 0; k < stride; k++ {
			out[k] = uint8((sums[k] + win/2) / win)
		}
		add := src[clampIdx(y+rad+1, h)*stride:]
		sub := src[clampIdx(y-rad, h)*stride:]
		for k := 0; k < stride; k++ {
			sums[k] += int(add[k]) - int(sub[k])
		}
	}
}
