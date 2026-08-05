package compose

import (
	"image"
	"image/color"
	"testing"
)

func renderGlyph(family string) *image.NRGBA {
	dst := image.NewNRGBA(image.Rect(0, 0, 48, 48))
	drawGenreIcon(dst, family, color.NRGBA{R: 43, G: 211, B: 196, A: 255},
		color.NRGBA{R: 10, G: 10, B: 12, A: 255}, 0, 0, 48)
	return dst
}

func inkedRows(img *image.NRGBA) (top, bottom int, painted int) {
	top, bottom = -1, -1
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y).A > 40 {
				painted++
				if top < 0 {
					top = y
				}
				bottom = y
			}
		}
	}
	return
}

// Without its own case the family fell back to the generic "other" mark, which
// renders a plausible-looking badge with the wrong icon (FR-163).
func TestSciFantasyHasItsOwnGlyph(t *testing.T) {
	mine := renderGlyph("scifantasy")
	generic := renderGlyph("other")

	same := true
	for i := range mine.Pix {
		if mine.Pix[i] != generic.Pix[i] {
			same = false
			break
		}
	}
	if same {
		t.Error("scifantasy renders the generic mark, so it has no glyph of its own")
	}
	if _, _, painted := inkedRows(mine); painted == 0 {
		t.Error("the glyph drew nothing at all")
	}
}

// The amendment that shortened the hilt and lifted the pommel exists because the
// original ran to the viewBox edge and sat hard against it at badge size. The
// glyph must clear the bottom of its box.
func TestTheGlyphClearsTheBottomOfTheIconBox(t *testing.T) {
	top, bottom, _ := inkedRows(renderGlyph("scifantasy"))
	if top < 0 {
		t.Fatal("nothing drawn")
	}
	// 22.75 of 24 at 48px is ~45.5, so the last inked row must sit above the edge.
	if bottom >= 47 {
		t.Errorf("glyph reaches row %d of 48, so the pommel is against the edge", bottom)
	}
	if top > 6 {
		t.Errorf("glyph starts at row %d, so the nose cone is not reaching the top", top)
	}
}
