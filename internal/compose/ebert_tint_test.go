package compose

import (
	"image"
	"image/color"
	"testing"
)

func solid(w, h int, c color.NRGBA) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetNRGBA(x, y, c)
		}
	}
	return img
}

// A white thumb takes the mark to 0% chroma, which is the silhouette path: it
// would be flooded with the source accent and the artwork inside would vanish.
// The mark brings its own dark disc, so it needs no tint (FR-165).
func TestASelfBackedMarkIsNotTinted(t *testing.T) {
	// A white glyph on its own black disc: no chroma, mostly dark.
	selfBacked := solid(40, 40, color.NRGBA{R: 10, G: 10, B: 12, A: 255})
	for y := 14; y < 26; y++ {
		for x := 14; x < 26; x++ {
			selfBacked.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	if !isBrandColored(selfBacked) {
		t.Error("a white glyph on its own dark disc would be tinted, flooding the disc")
	}
}

// The control, and the one that matters: a bare glyph on transparency still has
// to be tinted, or the exemption has swallowed the feature it guards.
func TestABareGlyphIsStillTinted(t *testing.T) {
	bare := image.NewNRGBA(image.Rect(0, 0, 40, 40))
	for y := 14; y < 26; y++ {
		for x := 14; x < 26; x++ {
			bare.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	if isBrandColored(bare) {
		t.Error("a bare white glyph is no longer tinted, so the exemption is too wide")
	}
}

// The shipped assets, so a future edit that drops the disc or the ring is caught
// here rather than on a poster.
func TestTheShippedEbertMarksTakeTheIntendedPath(t *testing.T) {
	for _, tc := range []struct {
		source string
		want   bool
		why    string
	}{
		{"rogerebert", true, "the plain mark must skip the tint via its own disc"},
		{"rogerebert-great-movie", true, "the Great Movies mark must skip it via its ring"},
	} {
		ensureIcons()
		img := ratingIcons[tc.source]
		if img == nil {
			t.Fatalf("%s: asset not loaded", tc.source)
		}
		if got := ratingIconColored[tc.source]; got != tc.want {
			t.Errorf("%s: isBrandColored = %v, want %v — %s", tc.source, got, tc.want, tc.why)
		}
	}
}
