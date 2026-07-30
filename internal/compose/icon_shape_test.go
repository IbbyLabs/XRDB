package compose

import (
	"image"
	"image/color"
	"testing"
)

func opaqueSquare(size int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: 200, G: 100, B: 50, A: 255})
		}
	}
	return img
}

func TestAnUnsetShapeLeavesTheMarkAlone(t *testing.T) {
	img := opaqueSquare(16)
	clipIconToShape(img, "")
	if img.NRGBAAt(0, 0).A != 255 {
		t.Error("an unset shape must not clip the mark")
	}
	clipIconToShape(img, "hexagon")
	if img.NRGBAAt(0, 0).A != 255 {
		t.Error("an unrecognised shape must not clip the mark")
	}
}

func TestACircleClipsTheCorners(t *testing.T) {
	img := opaqueSquare(16)
	clipIconToShape(img, "circle")
	if img.NRGBAAt(0, 0).A != 0 {
		t.Error("the corner must be cleared by a circular clip")
	}
	if img.NRGBAAt(8, 8).A != 255 {
		t.Error("the centre must survive a circular clip")
	}
}

func TestARoundedTileKeepsMoreThanASquircle(t *testing.T) {
	countOpaque := func(shape string) int {
		img := opaqueSquare(32)
		clipIconToShape(img, shape)
		n := 0
		for y := 0; y < 32; y++ {
			for x := 0; x < 32; x++ {
				if img.NRGBAAt(x, y).A > 0 {
					n++
				}
			}
		}
		return n
	}
	circle, squircle, rounded := countOpaque("circle"), countOpaque("squircle"), countOpaque("rounded")
	if circle >= squircle || squircle >= rounded {
		t.Errorf("expected circle < squircle < rounded, got %d, %d, %d", circle, squircle, rounded)
	}
}

// Clipping alone cannot show a shape, because brand marks already sit inside
// one: that is why the option read as doing nothing. Each shape has to be
// visibly apart from the others once drawn, not a handful of pixels apart.
func TestIconShapesAreVisiblyDistinctWhenDrawn(t *testing.T) {
	const floor = 200

	render := func(shape string) *image.NRGBA {
		dst := image.NewNRGBA(image.Rect(0, 0, 80, 80))
		for y := 0; y < 80; y++ {
			for x := 0; x < 80; x++ {
				dst.SetNRGBA(x, y, color.NRGBA{R: 20, G: 20, B: 26, A: 255})
			}
		}
		accent := color.NRGBA{R: 245, G: 197, B: 24, A: 255}
		drawBrandIcon(dst, image.Rect(8, 8, 72, 72), opaqueSquare(64), shape, accent, color.NRGBA{}, 0)
		return dst
	}

	diff := func(a, b *image.NRGBA) int {
		n := 0
		for y := 0; y < 80; y++ {
			for x := 0; x < 80; x++ {
				p, q := a.NRGBAAt(x, y), b.NRGBAAt(x, y)
				d := abs8(p.R, q.R) + abs8(p.G, q.G) + abs8(p.B, q.B) + abs8(p.A, q.A)
				if d > 24 {
					n++
				}
			}
		}
		return n
	}

	shapes := []string{"", "circle", "squircle", "rounded"}
	name := func(s string) string {
		if s == "" {
			return "original"
		}
		return s
	}
	rendered := make(map[string]*image.NRGBA, len(shapes))
	for _, s := range shapes {
		rendered[s] = render(s)
	}
	for i, a := range shapes {
		for _, b := range shapes[i+1:] {
			if n := diff(rendered[a], rendered[b]); n < floor {
				t.Errorf("%s and %s differ by only %d pixels, want at least %d",
					name(a), name(b), n, floor)
			}
		}
	}
}

func abs8(a, b uint8) int {
	if a > b {
		return int(a - b)
	}
	return int(b - a)
}
