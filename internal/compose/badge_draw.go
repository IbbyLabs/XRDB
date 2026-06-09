package compose

import (
	"image"
	"image/color"

	"golang.org/x/image/font"
	"golang.org/x/image/math/fixed"
)

// fillRoundedRect fills a rounded rectangle onto dst.
func fillRoundedRect(dst *image.NRGBA, r image.Rectangle, radius int, c color.NRGBA) {
	bounds := dst.Bounds()
	r = r.Intersect(bounds)
	cr := float64(radius)
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			if inCornerZone(x, y, r, radius) {
				cx, cy := cornerCenter(x, y, r, radius)
				dx := float64(x) - cx + 0.5
				dy := float64(y) - cy + 0.5
				if dx*dx+dy*dy > cr*cr {
					continue
				}
			}
			dst.SetNRGBA(x, y, c)
		}
	}
}

func inCornerZone(x, y int, r image.Rectangle, radius int) bool {
	return (x < r.Min.X+radius || x >= r.Max.X-radius) &&
		(y < r.Min.Y+radius || y >= r.Max.Y-radius)
}

func cornerCenter(x, y int, r image.Rectangle, radius int) (float64, float64) {
	var cx, cy float64
	if x < r.Min.X+radius {
		cx = float64(r.Min.X + radius)
	} else {
		cx = float64(r.Max.X - radius)
	}
	if y < r.Min.Y+radius {
		cy = float64(r.Min.Y + radius)
	} else {
		cy = float64(r.Max.Y - radius)
	}
	return cx, cy
}

// fillRect fills a rectangle on dst with c (no alpha blending).
func fillRect(dst *image.NRGBA, r image.Rectangle, c color.NRGBA) {
	b := dst.Bounds()
	r = r.Intersect(b)
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			dst.SetNRGBA(x, y, c)
		}
	}
}

// drawText renders s onto dst at the given baseline (x, y) using face.
func drawText(dst *image.NRGBA, face font.Face, x, y int, c color.Color, s string) {
	d := &font.Drawer{
		Dst:  dst,
		Src:  image.NewUniform(c),
		Face: face,
		Dot:  fixed.P(x, y),
	}
	d.DrawString(s)
}

// textWidth returns the rendered pixel width of s using face.
func textWidth(face font.Face, s string) int {
	return font.MeasureString(face, s).Ceil()
}

// drawRectBorder draws a 1px border around a rounded rectangle.
func drawRectBorder(dst *image.NRGBA, r image.Rectangle, radius int, c color.NRGBA) {
	cr := float64(radius)
	b := dst.Bounds()
	for x := r.Min.X; x < r.Max.X; x++ {
		onEdge := x == r.Min.X || x == r.Max.X-1
		for y := r.Min.Y; y < r.Max.Y; y++ {
			if !onEdge && y != r.Min.Y && y != r.Max.Y-1 {
				continue
			}
			pt := image.Pt(x, y)
			if !pt.In(b) {
				continue
			}
			if inCornerZone(x, y, r, radius) {
				cx, cy := cornerCenter(x, y, r, radius)
				dx := float64(x) - cx + 0.5
				dy := float64(y) - cy + 0.5
				if dx*dx+dy*dy > cr*cr {
					continue
				}
			}
			dst.SetNRGBA(x, y, c)
		}
	}
}
