package compose

import (
	"image"
	"image/color"
	"math"
)

// Title-logo shadow styles. "" is the blurred drop shadow.
const (
	logoShadowExtrude = "extrude" // stacked copies reading as depth
	logoShadowGel     = "gel"     // tight shadow plus an opposite highlight
	logoShadowEmboss  = "emboss"  // lit and shadowed rims on the mark's own edges
)

// glyphShadowOpts is the treatment drawn behind a title logo. It is taken from
// the mark's own alpha channel, so only the glyphs cast anything.
type glyphShadowOpts struct {
	spread   int         // % of the logo's height the treatment reaches past it; 0 = 50
	strength int         // peak alpha, 0-100; 0 = 63
	offsetX  int         // px, may be negative; both zero takes the style's own drop
	offsetY  int         // px, may be negative
	color    color.NRGBA // RGB of the shadow; the zero value is black
	style    string      // "" = shadow
}

// drawGlyphShadow lays the shadow of the logo's own shape onto base, beneath
// where the logo will be drawn.
//
// spread is a percent of the logo's height, so the control keeps its meaning at
// any logo size: how far the treatment reaches past the mark.
func drawGlyphShadow(base *image.NRGBA, logo *image.NRGBA, originX, originY int, o glyphShadowOpts) {
	if logo == nil {
		return
	}
	spread, strength := o.spread, o.strength
	if spread == 0 {
		spread = 50
	}
	if strength == 0 {
		strength = 63
	}
	lb := logo.Bounds()
	if lb.Dx() == 0 || lb.Dy() == 0 {
		return
	}

	// A blur as wide as the mark would swallow the glyphs. Quartering it puts a
	// 100px-tall wordmark at roughly a 12px radius, which reads as a shadow.
	radius := lb.Dy() * spread / 400
	if radius < 1 {
		radius = 1
	}

	offX, offY := o.offsetX, o.offsetY
	if offX == 0 && offY == 0 {
		offX, offY = defaultShadowOffset(o.style, radius)
	}

	tint := o.color
	tint.A = 255

	switch o.style {
	case logoShadowExtrude:
		drawExtrudedShadow(base, logo, originX, originY, offX, offY, strength, tint)
	case logoShadowGel:
		drawGelShadow(base, logo, originX, originY, radius, offX, offY, strength, tint)
	case logoShadowEmboss:
		// Nothing underneath: the whole effect is the rim drawn over the mark.
		return
	default: // the drop shadow, and anything the parser did not recognise
		drawSoftShadow(base, logo, originX, originY, radius, offX, offY, strength, tint)
	}
}

// defaultShadowOffset is where a style puts its shadow when the config sets no
// offset. Each scales with the blur radius, so it holds at any logo size.
func defaultShadowOffset(style string, radius int) (int, int) {
	switch style {
	case logoShadowExtrude:
		// Extrusion has to read as depth at a glance, so it throws several times
		// further than a shadow would. At the shadow's own offset the two styles
		// were indistinguishable, which made the choice pointless.
		d := radius * 5 / 2
		if d < 6 {
			d = 6
		}
		return d, d
	case logoShadowGel:
		// A moulded edge sits proud of the surface: the offset has to clear the
		// glyph's own blur or the highlight lands on the letter and disappears
		// into it, which is what happens on light artwork.
		d := radius
		if d < 3 {
			d = 3
		}
		return d, d
	default:
		// A shadow sitting slightly below the mark reads as cast rather than as
		// a halo.
		return 0, radius / 2
	}
}

// drawSoftShadow blurs the glyph mask and lays it down once.
func drawSoftShadow(base, logo *image.NRGBA, originX, originY, radius, offX, offY, strength int, tint color.NRGBA) {
	// Pad so the blur falls off past the glyphs instead of being cut square at
	// the mark's edge.
	pad := radius * 3
	mask, mw, mh := glyphMask(logo, pad)

	// Two box-blur passes approximate a Gaussian closely enough and stay cheap.
	blurred := boxBlur(boxBlur(mask, mw, mh, radius), mw, mh, radius)

	// Blurring spreads the alpha out and drops its peak, so normalise to put the
	// densest part of the shadow at the requested strength.
	peak := 0.0
	for _, v := range blurred {
		if v > peak {
			peak = v
		}
	}
	if peak <= 0 {
		return
	}
	blendLayer(base, blurred, mw, mh, originX-pad+offX, originY-pad+offY, tint, float64(strength)*255/100/peak)
}

// drawExtrudedShadow repeats the glyph mask at growing offsets to build a solid
// slab of depth behind the mark. The step count tracks the extrusion distance,
// so copies stay about a pixel apart whatever the logo's size.
func drawExtrudedShadow(base, logo *image.NRGBA, originX, originY, offX, offY, strength int, tint color.NRGBA) {
	depth := maxAbs(offX, offY)
	pad := depth + 4
	mask, mw, mh := glyphMask(logo, pad)

	steps := depth
	if steps < 4 {
		steps = 4
	}
	if steps > 96 {
		steps = 96
	}

	stack := make([]float64, len(mask))
	for i := 1; i <= steps; i++ {
		t := float64(i) / float64(steps)
		dx := int(math.Round(float64(offX) * t))
		dy := int(math.Round(float64(offY) * t))
		// The far end sits back into the artwork, so it carries less of the
		// shadow than the face the letters meet.
		f := 1 - 0.4*t
		for y := 0; y < mh; y++ {
			sy := y - dy
			if sy < 0 || sy >= mh {
				continue
			}
			for x := 0; x < mw; x++ {
				sx := x - dx
				if sx < 0 || sx >= mw {
					continue
				}
				if v := mask[sy*mw+sx] * f; v > stack[y*mw+x] {
					stack[y*mw+x] = v
				}
			}
		}
	}

	// One pixel of blur takes the stair-stepping off a diagonal extrusion
	// without softening the slab.
	blendLayer(base, boxBlur(stack, mw, mh, 1), mw, mh, originX-pad, originY-pad, tint, float64(strength)/100)
}

// drawGelShadow lays a tight shadow one way and a faint highlight the other, so
// the glyphs read as raised off the artwork.
func drawGelShadow(base, logo *image.NRGBA, originX, originY, radius, offX, offY, strength int, tint color.NRGBA) {
	blurR := radius / 4
	if blurR < 1 {
		blurR = 1
	}
	pad := blurR*4 + 1 + maxAbs(offX, offY)
	mask, mw, mh := glyphMask(logo, pad)
	soft := boxBlur(boxBlur(mask, mw, mh, blurR), mw, mh, blurR)

	// The lit edge of a moulded surface is crisper than the shadow it throws, so
	// the highlight takes half the blur. It only has to suggest the light: at
	// full strength it reads as a white outline instead.
	// One pixel of blur, so the lit edge is a hard rim rather than a glow. Half
	// the shadow's blur still read as a smudge and vanished on pale artwork.
	crisp := 1
	highlight := color.NRGBA{R: 255, G: 255, B: 255, A: 255}
	// The shadow goes down first so the rim sits on top of it where they meet,
	// which is what makes the edge look raised instead of merely outlined.
	blendLayer(base, soft, mw, mh, originX-pad+offX, originY-pad+offY, tint, float64(strength)/100)
	blendLayer(base, boxBlur(mask, mw, mh, crisp), mw, mh, originX-pad-offX, originY-pad-offY, highlight, float64(strength)*0.9/100)
}

// glyphMask copies the logo's alpha channel into a padded single-channel buffer.
func glyphMask(logo *image.NRGBA, pad int) ([]float64, int, int) {
	lb := logo.Bounds()
	lw, lh := lb.Dx(), lb.Dy()
	mw, mh := lw+pad*2, lh+pad*2
	mask := make([]float64, mw*mh)
	for y := 0; y < lh; y++ {
		for x := 0; x < lw; x++ {
			mask[(y+pad)*mw+(x+pad)] = float64(logo.NRGBAAt(lb.Min.X+x, lb.Min.Y+y).A)
		}
	}
	return mask, mw, mh
}

// blendLayer composites one alpha map onto base with its top-left at (x, y),
// scaling the map into an alpha for tint.
func blendLayer(base *image.NRGBA, layer []float64, w, h, x, y int, tint color.NRGBA, scale float64) {
	bb := base.Bounds()
	for row := 0; row < h; row++ {
		py := bb.Min.Y + y + row
		if py < bb.Min.Y || py >= bb.Max.Y {
			continue
		}
		for col := 0; col < w; col++ {
			a := layer[row*w+col] * scale
			if a < 1 {
				continue
			}
			if a > 255 {
				a = 255
			}
			px := bb.Min.X + x + col
			if px < bb.Min.X || px >= bb.Max.X {
				continue
			}
			base.SetNRGBA(px, py, blendTint(base.NRGBAAt(px, py), tint, uint8(a)))
		}
	}
}

// blendTint composites tint over src at the given alpha.
func blendTint(src, tint color.NRGBA, alpha uint8) color.NRGBA {
	a := float64(alpha) / 255
	blend := func(s, t uint8) uint8 {
		return uint8(float64(s)*(1-a) + float64(t)*a + 0.5)
	}
	return color.NRGBA{
		R: blend(src.R, tint.R),
		G: blend(src.G, tint.G),
		B: blend(src.B, tint.B),
		A: src.A,
	}
}

func maxAbs(a, b int) int {
	if a < 0 {
		a = -a
	}
	if b < 0 {
		b = -b
	}
	if a > b {
		return a
	}
	return b
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

// drawEmbossRim lights the mark's own edges instead of casting anything behind
// it: the side facing the light gets a bright rim, the opposite side a dark one,
// and the face is left alone. It is what makes carved lettering read as carved.
//
// This draws OVER the logo. Every other treatment here goes underneath and is
// then covered by the mark, which is exactly why none of them could produce a
// bevel — the effect lives on the glyph's own edge, not around it.
func drawEmbossRim(base, logo *image.NRGBA, originX, originY int, o glyphShadowOpts) {
	if logo == nil {
		return
	}
	lb := logo.Bounds()
	spread := o.spread
	if spread == 0 {
		spread = 50
	}
	depth := lb.Dy() * spread / 400 / 2
	if depth < 1 {
		depth = 1
	}
	if depth > 12 {
		depth = 12
	}
	strength := o.strength
	if strength == 0 {
		strength = 63
	}

	pad := depth + 2
	mask, mw, mh := glyphMask(logo, pad)

	// The lit rim is what the mark covers but its own shadow-side copy does not,
	// so it falls on the edge facing the light. The dark rim is the mirror.
	lit := rimBand(mask, mw, mh, depth, depth)
	dark := rimBand(mask, mw, mh, -depth, -depth)

	// One pass only. Blurring a rim past a pixel or two turns a carved edge back
	// into the glow this style exists to avoid.
	lit = boxBlur(lit, mw, mh, 1)
	dark = boxBlur(dark, mw, mh, 1)

	white := color.NRGBA{R: 255, G: 255, B: 255, A: 255}
	blendLayer(base, dark, mw, mh, originX-pad, originY-pad, o.color, float64(strength)/100)
	blendLayer(base, lit, mw, mh, originX-pad, originY-pad, white, float64(strength)*0.85/100)
}

// rimBand returns the part of mask that the same mask shifted by (dx, dy) does
// not cover — the band along one side of every stroke.
func rimBand(mask []float64, w, h, dx, dy int) []float64 {
	out := make([]float64, len(mask))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			sx, sy := x-dx, y-dy
			var shifted float64
			if sx >= 0 && sx < w && sy >= 0 && sy < h {
				shifted = mask[sy*w+sx]
			}
			if v := mask[y*w+x] - shifted; v > 0 {
				out[y*w+x] = v
			}
		}
	}
	return out
}
