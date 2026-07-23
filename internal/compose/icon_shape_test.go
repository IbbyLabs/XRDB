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
