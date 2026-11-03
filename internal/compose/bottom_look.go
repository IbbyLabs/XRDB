package compose

import (
	"image"
	"image/color"
	"math"

	"xrdb_rewrite/internal/imageconfig"
)

const (
	bottomFadeDefaultOpacity  = 80
	bottomBlurDefaultStrength = 50
	// bottomBlurWidthFraction is the blur radius at strength 100 as a share of the frame width.
	bottomBlurWidthFraction = 0.02
)

// bottomLookOpts carries the bottom fade and blur. The zero value draws nothing.
type bottomLookOpts struct {
	fadeHeight   int // % of height; 0 = off
	fadeOpacity  int // 0-100; 0 = 80
	fadeColor    string
	blurHeight   int  // % of height; 0 = off
	blurStrength int  // 1-100; 0 = 50
	blurFeather  *int // 0-100; nil = 100
	topHeight    int  // % of height; 0 = off
	topStrength  int  // 1-100; 0 = 50
	topFeather   *int // 0-100; nil = 100
}

func bottomLookFromConfig(cfg imageconfig.Config) bottomLookOpts {
	return bottomLookOpts{
		fadeHeight:   cfg.BottomFadeHeight,
		fadeOpacity:  cfg.BottomFadeOpacity,
		fadeColor:    cfg.BottomFadeColor,
		blurHeight:   cfg.BottomBlurHeight,
		blurStrength: cfg.BottomBlurStrength,
		blurFeather:  cfg.BottomBlurFeather,
		topHeight:    cfg.TopBlurHeight,
		topStrength:  cfg.TopBlurStrength,
		topFeather:   cfg.TopBlurFeather,
	}
}

// drawBottomLook blurs the top and bottom bands, then fades the bottom.
func drawBottomLook(base *image.NRGBA, o bottomLookOpts) {
	drawTopBlur(base, o.topHeight, o.topStrength, o.topFeather)
	drawBottomBlur(base, o.blurHeight, o.blurStrength, o.blurFeather)
	drawBottomFade(base, o.fadeHeight, o.fadeOpacity, o.fadeColor)
}

func bottomBandRows(base *image.NRGBA, heightPercent int) int {
	if heightPercent <= 0 {
		return 0
	}
	return min(base.Bounds().Dy(), max(1, base.Bounds().Dy()*heightPercent/100))
}

// blurRadius maps a 1-100 strength to a box radius: linear to 50, then a steeper
// curve that reaches 6% of the width at 100.
func blurRadius(strength, width int) int {
	if strength <= 0 {
		strength = bottomBlurDefaultStrength
	}
	s := float64(min(strength, 100))
	frac := s / 100 * bottomBlurWidthFraction
	if s > 50 {
		d := s - 50
		frac = 0.01 + 0.0002*d + 0.000016*d*d
	}
	return max(1, int(math.Round(frac*float64(width))))
}

// blurRamp is the half-width of the smoothstep ramp: the feather share of the band, halved.
func blurRamp(reach int, feather *int) int {
	pct := 100
	if feather != nil {
		pct = min(max(*feather, 0), 100)
	}
	return max(1, reach*pct/100/2)
}

func drawBottomBlur(base *image.NRGBA, heightPercent, strength int, feather *int) {
	reach := bottomBandRows(base, heightPercent)
	if reach == 0 {
		return
	}
	b := base.Bounds()
	rad := blurRadius(strength, b.Dx())
	f := blurRamp(reach, feather)
	r := image.Rect(b.Min.X-f-1, b.Max.Y-reach+f, b.Max.X+f+1, b.Max.Y+f+1)
	frostFeatheredRadius(base, r, f, rad)
}

func drawTopBlur(base *image.NRGBA, heightPercent, strength int, feather *int) {
	reach := bottomBandRows(base, heightPercent)
	if reach == 0 {
		return
	}
	b := base.Bounds()
	rad := blurRadius(strength, b.Dx())
	f := blurRamp(reach, feather)
	r := image.Rect(b.Min.X-f-1, b.Min.Y-f-1, b.Max.X+f+1, b.Min.Y+reach-f)
	frostFeatheredRadius(base, r, f, rad)
}

func drawBottomFade(base *image.NRGBA, heightPercent, opacity int, hex string) {
	rows := bottomBandRows(base, heightPercent)
	if rows == 0 {
		return
	}
	if opacity <= 0 {
		opacity = bottomFadeDefaultOpacity
	}
	tint := color.NRGBA{A: 255}
	if hex != "" {
		if c, err := parseHexColor(hex); err == nil {
			tint = c
		}
	}
	b := base.Bounds()
	peak := float64(min(opacity, 100)) / 100
	for y := b.Max.Y - rows; y < b.Max.Y; y++ {
		t := (float64(y-(b.Max.Y-rows)) + 0.5) / float64(rows)
		a := peak * t * t * (3 - 2*t)
		if a <= 0 {
			continue
		}
		row := base.Pix[(y-b.Min.Y)*base.Stride:]
		for x := 0; x < b.Dx(); x++ {
			px := row[x*4 : x*4+4]
			px[0] = mixByte(px[0], tint.R, a)
			px[1] = mixByte(px[1], tint.G, a)
			px[2] = mixByte(px[2], tint.B, a)
			px[3] = uint8(math.Round(float64(px[3]) + (255-float64(px[3]))*a))
		}
	}
}

func mixByte(from, to uint8, a float64) uint8 {
	return uint8(math.Round(float64(from)*(1-a) + float64(to)*a))
}
