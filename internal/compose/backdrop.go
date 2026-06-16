package compose

import (
	"image"
	"image/color"
	"image/draw"

	xdraw "golang.org/x/image/draw"
)

// saliencyCropOffset returns the (x, y) pixel offset into img that captures
// the most visually active region when cropping to cropW×cropH. It computes
// a coarse gradient-energy map (sampled every step pixels) and slides a
// window of the target size across each axis to maximise total energy.
//
// When only one axis overflows the target size (the typical case when scaling
// to cover), only that axis uses saliency; the other is centred normally.
func saliencyCropOffset(img *image.NRGBA, cropW, cropH int) (offX, offY int) {
	b := img.Bounds()
	iW, iH := b.Dx(), b.Dy()

	maxOffX := iW - cropW
	maxOffY := iH - cropH
	if maxOffX < 0 {
		maxOffX = 0
	}
	if maxOffY < 0 {
		maxOffY = 0
	}

	const step = 4

	colScore := make([]float64, iW)
	rowScore := make([]float64, iH)

	lum := func(c color.NRGBA) float64 {
		return 0.299*float64(c.R) + 0.587*float64(c.G) + 0.114*float64(c.B)
	}

	for y := step; y < iH-step; y += step {
		for x := step; x < iW-step; x += step {
			c := img.NRGBAAt(x, y)
			r := img.NRGBAAt(x+step, y)
			d := img.NRGBAAt(x, y+step)
			dx := lum(r) - lum(c)
			dy := lum(d) - lum(c)
			grad := dx*dx + dy*dy
			colScore[x] += grad
			rowScore[y] += grad
		}
	}

	offX = maxOffX / 2
	if maxOffX > 0 {
		win := 0.0
		for i := 0; i < cropW && i < iW; i++ {
			win += colScore[i]
		}
		best, bestScore := 0, win
		for off := 1; off <= maxOffX; off++ {
			if off+cropW-1 < iW {
				win += colScore[off+cropW-1]
			}
			win -= colScore[off-1]
			if win > bestScore {
				bestScore = win
				best = off
			}
		}
		offX = best
	}

	offY = maxOffY / 2
	if maxOffY > 0 {
		win := 0.0
		for i := 0; i < cropH && i < iH; i++ {
			win += rowScore[i]
		}
		best, bestScore := 0, win
		for off := 1; off <= maxOffY; off++ {
			if off+cropH-1 < iH {
				win += rowScore[off+cropH-1]
			}
			win -= rowScore[off-1]
			if win > bestScore {
				bestScore = win
				best = off
			}
		}
		offY = best
	}

	return offX, offY
}

// resizeFitSmart is like resizeFit but uses saliency to pick the crop offset
// instead of always centering. For backdrop→poster crops this prevents subjects
// from being clipped when the important content is off-centre.
func resizeFitSmart(src image.Image, maxW, maxH int) image.Image {
	srcB := src.Bounds()
	srcW, srcH := srcB.Dx(), srcB.Dy()
	if srcW == 0 || srcH == 0 {
		return image.NewNRGBA(image.Rect(0, 0, maxW, maxH))
	}

	scaleX := float64(maxW) / float64(srcW)
	scaleY := float64(maxH) / float64(srcH)
	scale := scaleX
	if scaleY > scaleX {
		scale = scaleY
	}

	scaledW := int(float64(srcW)*scale + 0.5)
	scaledH := int(float64(srcH)*scale + 0.5)
	if scaledW < maxW {
		scaledW = maxW
	}
	if scaledH < maxH {
		scaledH = maxH
	}

	scaled := image.NewNRGBA(image.Rect(0, 0, scaledW, scaledH))
	xdraw.BiLinear.Scale(scaled, scaled.Bounds(), src, srcB, xdraw.Over, nil)

	offX, offY := saliencyCropOffset(scaled, maxW, maxH)

	dst := image.NewNRGBA(image.Rect(0, 0, maxW, maxH))
	draw.Draw(dst, dst.Bounds(), scaled, image.Pt(offX, offY), draw.Src)
	return dst
}

// drawBackdropLogoOverlay composites a title logo image onto base. The logo is
// scaled to fit within 65% of the base width and 20% of the base height, then
// centred horizontally and placed in the lower-third (72% from top). A
// semi-transparent gradient scrim is drawn behind the logo so it remains
// legible over bright backdrops.
func drawBackdropLogoOverlay(base *image.NRGBA, logoData []byte) {
	if len(logoData) == 0 {
		return
	}
	logoImg, err := decodeImage(logoData)
	if err != nil {
		return
	}

	bounds := base.Bounds()
	baseW, baseH := bounds.Dx(), bounds.Dy()

	maxLogoW := int(float64(baseW) * 0.65)
	maxLogoH := int(float64(baseH) * 0.20)

	lB := logoImg.Bounds()
	lW, lH := lB.Dx(), lB.Dy()
	if lW == 0 || lH == 0 {
		return
	}

	scaleX := float64(maxLogoW) / float64(lW)
	scaleY := float64(maxLogoH) / float64(lH)
	s := scaleX
	if scaleY < s {
		s = scaleY
	}

	dstW := int(float64(lW)*s + 0.5)
	dstH := int(float64(lH)*s + 0.5)
	if dstW < 1 || dstH < 1 {
		return
	}

	scaled := image.NewNRGBA(image.Rect(0, 0, dstW, dstH))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), logoImg, lB, xdraw.Over, nil)

	x := (baseW - dstW) / 2
	logoTopY := int(float64(baseH)*0.72) - dstH/2
	if logoTopY < 0 {
		logoTopY = 0
	}
	if logoTopY+dstH > baseH {
		logoTopY = baseH - dstH
	}

	// Vertical gradient scrim behind the logo for legibility over bright areas.
	scrimPad := dstH / 2
	scrimTop := logoTopY - scrimPad
	if scrimTop < 0 {
		scrimTop = 0
	}
	scrimBot := logoTopY + dstH + scrimPad
	if scrimBot > baseH {
		scrimBot = baseH
	}
	scrimH := scrimBot - scrimTop
	if scrimH > 0 {
		for row := 0; row < scrimH; row++ {
			rel := float64(row) / float64(scrimH)
			var t float64
			if rel < 0.5 {
				t = rel * 2
			} else {
				t = (1 - rel) * 2
			}
			alpha := uint8(t * 160)
			for col := 0; col < baseW; col++ {
				py := bounds.Min.Y + scrimTop + row
				px := bounds.Min.X + col
				existing := base.NRGBAAt(px, py)
				base.SetNRGBA(px, py, blendScrim(existing, alpha))
			}
		}
	}

	logoRect := image.Rect(x, logoTopY, x+dstW, logoTopY+dstH)
	draw.Draw(base, logoRect, scaled, image.Point{}, draw.Over)
}

// blendScrim darkens a pixel by compositing a semi-transparent black scrim
// over it (equivalent to black at scrimAlpha opacity).
func blendScrim(src color.NRGBA, scrimAlpha uint8) color.NRGBA {
	a := float64(scrimAlpha) / 255
	blend := func(ch uint8) uint8 {
		return uint8(float64(ch)*(1-a) + 0.5)
	}
	return color.NRGBA{
		R: blend(src.R),
		G: blend(src.G),
		B: blend(src.B),
		A: src.A,
	}
}
