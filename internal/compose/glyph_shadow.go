package compose

import "image"

// drawGlyphShadow lays a soft shadow of the logo's own shape onto base, beneath
// where the logo will be drawn.
//
// The shading it replaces was derived from the logo's bounding box, so a
// wordmark that is mostly empty space had its empty space darkened too and the
// result read as a shadow cast by an invisible rectangle. Taking the shape from
// the alpha channel instead means only the glyphs cast anything.
//
// spread is a percent of the logo's height, reused from the old scrim size so
// the control keeps its meaning: how far the treatment reaches past the mark.
// strength is the darkest the shadow gets, 0-100.
func drawGlyphShadow(base *image.NRGBA, logo *image.NRGBA, originX, originY, spread, strength int) {
	if logo == nil {
		return
	}
	if spread == 0 {
		spread = 50
	}
	if strength == 0 {
		strength = 63
	}
	lb := logo.Bounds()
	lw, lh := lb.Dx(), lb.Dy()
	if lw == 0 || lh == 0 {
		return
	}

	// A blur as wide as the old box would swallow the glyphs. Quartering it puts
	// a 100px-tall wordmark at roughly a 12px radius, which reads as a shadow.
	radius := lh * spread / 400
	if radius < 1 {
		radius = 1
	}
	// The shadow sits slightly below the mark, which is what makes it read as
	// cast rather than as a halo.
	offsetY := radius / 2

	// Pad so the blur has room to fall off past the glyphs instead of being cut
	// square at the logo's edge.
	pad := radius * 3
	mw, mh := lw+pad*2, lh+pad*2
	mask := make([]float64, mw*mh)
	for y := 0; y < lh; y++ {
		for x := 0; x < lw; x++ {
			mask[(y+pad)*mw+(x+pad)] = float64(logo.NRGBAAt(lb.Min.X+x, lb.Min.Y+y).A)
		}
	}

	// Two box-blur passes approximate a Gaussian closely enough and stay cheap.
	blurred := boxBlur(boxBlur(mask, mw, mh, radius), mw, mh, radius)

	// Normalise so the densest part of the shadow reaches the requested
	// strength: blurring spreads the alpha out and drops its peak.
	peak := 0.0
	for _, v := range blurred {
		if v > peak {
			peak = v
		}
	}
	if peak <= 0 {
		return
	}
	scale := float64(strength) * 255 / 100 / peak

	bb := base.Bounds()
	for y := 0; y < mh; y++ {
		py := bb.Min.Y + originY - pad + y + offsetY
		if py < bb.Min.Y || py >= bb.Max.Y {
			continue
		}
		for x := 0; x < mw; x++ {
			a := blurred[y*mw+x] * scale
			if a < 1 {
				continue
			}
			if a > 255 {
				a = 255
			}
			px := bb.Min.X + originX - pad + x
			if px < bb.Min.X || px >= bb.Max.X {
				continue
			}
			base.SetNRGBA(px, py, blendScrim(base.NRGBAAt(px, py), uint8(a)))
		}
	}
}

// boxBlur runs a separable box blur over a single-channel image.
func boxBlur(src []float64, w, h, radius int) []float64 {
	if radius < 1 {
		return src
	}
	tmp := make([]float64, len(src))
	out := make([]float64, len(src))
	win := float64(radius*2 + 1)

	for y := 0; y < h; y++ {
		row := y * w
		sum := 0.0
		for x := -radius; x <= radius; x++ {
			sum += src[row+clampIdx(x, w)]
		}
		for x := 0; x < w; x++ {
			tmp[row+x] = sum / win
			sum -= src[row+clampIdx(x-radius, w)]
			sum += src[row+clampIdx(x+radius+1, w)]
		}
	}
	for x := 0; x < w; x++ {
		sum := 0.0
		for y := -radius; y <= radius; y++ {
			sum += tmp[clampIdx(y, h)*w+x]
		}
		for y := 0; y < h; y++ {
			out[y*w+x] = sum / win
			sum -= tmp[clampIdx(y-radius, h)*w+x]
			sum += tmp[clampIdx(y+radius+1, h)*w+x]
		}
	}
	return out
}

func clampIdx(i, n int) int {
	if i < 0 {
		return 0
	}
	if i >= n {
		return n - 1
	}
	return i
}
