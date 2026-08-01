package compose

import (
	"image"
	"image/color"
	"testing"
)

func countColor(img *image.NRGBA, want color.NRGBA) int {
	n := 0
	for i := 0; i < len(img.Pix); i += 4 {
		if img.Pix[i] == want.R && img.Pix[i+1] == want.G &&
			img.Pix[i+2] == want.B && img.Pix[i+3] == want.A {
			n++
		}
	}
	return n
}

// A provider mark drawn straight onto artwork of the same tone disappears. The
// outline traces the mark itself, so it has to paint outside the mark's own box
// without covering it.
func TestIconOutlineDrawsAroundTheMark(t *testing.T) {
	const outlineWidth = 3
	outline := color.NRGBA{R: 255, G: 0, B: 0, A: 255}
	box := image.Rect(16, 16, 80, 80)

	plain := image.NewNRGBA(image.Rect(0, 0, 96, 96))
	drawBrandIcon(plain, box, opaqueSquare(48), "", color.NRGBA{}, color.NRGBA{}, 0, false)

	outlined := image.NewNRGBA(image.Rect(0, 0, 96, 96))
	drawBrandIcon(outlined, box, opaqueSquare(48), "", color.NRGBA{}, outline, outlineWidth, false)

	if got := countColor(plain, outline); got != 0 {
		t.Errorf("no outline was requested but %d pixels carry the outline color", got)
	}
	drawn := countColor(outlined, outline)
	if drawn == 0 {
		t.Fatal("an outline was requested but none was drawn")
	}

	// The mark must still be on top of its own outline.
	mark := color.NRGBA{R: 200, G: 100, B: 50, A: 255}
	if before, after := countColor(plain, mark), countColor(outlined, mark); after != before {
		t.Errorf("the outline covered the mark: %d mark pixels became %d", before, after)
	}

	wider := image.NewNRGBA(image.Rect(0, 0, 96, 96))
	drawBrandIcon(wider, box, opaqueSquare(48), "", color.NRGBA{}, outline, outlineWidth+2, false)
	if got := countColor(wider, outline); got <= drawn {
		t.Errorf("a wider outline painted %d pixels, want more than %d", got, drawn)
	}
}
