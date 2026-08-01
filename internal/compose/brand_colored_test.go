package compose

import (
	"image"
	"image/color"
	"testing"
)

func markWith(fill color.NRGBA, extra func(*image.NRGBA)) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, 20, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 20; x++ {
			img.SetNRGBA(x, y, fill)
		}
	}
	if extra != nil {
		extra(img)
	}
	return img
}

// A mark drawn in greys is meant to be recoloured with the source's accent. It
// was being called a brand mark on its first non-white pixel, so it kept its
// own greys and rendered black and white next to coloured sources.
func TestGreyMarkIsNotTreatedAsBrandColoured(t *testing.T) {
	grey := markWith(color.NRGBA{R: 255, G: 255, B: 255, A: 255}, func(img *image.NRGBA) {
		// Anti-aliased edge plus a dark detail, all neutral.
		for x := 0; x < 20; x++ {
			img.SetNRGBA(x, 0, color.NRGBA{R: 128, G: 128, B: 128, A: 255})
			img.SetNRGBA(x, 19, color.NRGBA{R: 20, G: 20, B: 20, A: 255})
		}
	})
	if isBrandColored(grey) {
		t.Error("a greyscale mark was called brand coloured, so it will not be tinted")
	}
}

// A real brand mark carries colour and must be drawn as it is.
func TestColouredMarkIsTreatedAsBrandColoured(t *testing.T) {
	brand := markWith(color.NRGBA{R: 250, G: 60, B: 30, A: 255}, nil)
	if !isBrandColored(brand) {
		t.Error("a coloured brand mark was not detected, so it will be tinted over")
	}
}

// One stray coloured pixel is an asset artefact, not a brand mark.
func TestSingleColouredPixelDoesNotMakeAMarkBrandColoured(t *testing.T) {
	mostlyWhite := markWith(color.NRGBA{R: 255, G: 255, B: 255, A: 255}, func(img *image.NRGBA) {
		img.SetNRGBA(10, 10, color.NRGBA{R: 255, G: 0, B: 0, A: 255})
	})
	if isBrandColored(mostlyWhite) {
		t.Error("one coloured pixel in 400 was enough to call the mark brand coloured")
	}
}

// A fully transparent mark has nothing to judge and must not claim colour.
func TestTransparentMarkIsNotBrandColoured(t *testing.T) {
	if isBrandColored(image.NewNRGBA(image.Rect(0, 0, 8, 8))) {
		t.Error("an empty mark was called brand coloured")
	}
}
