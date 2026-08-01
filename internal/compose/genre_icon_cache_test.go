package compose

import (
	"bytes"
	"image"
	"image/color"
	"math"
	"testing"
)

// referenceGenreIcon is the rasteriser as it stood before coverage was cached:
// every pixel resampled on every call. Kept here so the cached path is checked
// against what it replaced rather than against itself.
func referenceGenreIcon(dst *image.NRGBA, familyID string, accent, darkCol color.NRGBA, x, y, size int) {
	if size <= 0 {
		return
	}
	shapes := genreIconShapes(familyID)
	scale := float64(size) / genreIconViewBox
	step := 1.0 / float64(genreIconSubsamples)
	weight := 1.0 / float64(genreIconSubsamples*genreIconSubsamples)

	for _, sh := range shapes {
		alpha := sh.alpha
		if alpha == 0 {
			alpha = 1
		}
		col := accent
		if sh.dark {
			col = darkCol
		}
		for py := 0; py < size; py++ {
			for px := 0; px < size; px++ {
				cov := 0.0
				for sy := 0; sy < genreIconSubsamples; sy++ {
					for sx := 0; sx < genreIconSubsamples; sx++ {
						gx := (float64(px) + (float64(sx)+0.5)*step) / scale
						gy := (float64(py) + (float64(sy)+0.5)*step) / scale
						if sh.prim.covers(gx, gy) {
							cov += weight
						}
					}
				}
				if cov <= 0 {
					continue
				}
				c := col
				c.A = uint8(math.Round(float64(col.A) * alpha * cov))
				if c.A == 0 {
					continue
				}
				blendPixel(dst, x+px, y+py, c)
			}
		}
	}
}

func TestCachedGenreIconMatchesTheRasteriser(t *testing.T) {
	accent := color.NRGBA{R: 250, G: 50, B: 10, A: 255}
	dark := color.NRGBA{R: 5, G: 7, B: 11, A: 255}

	// Every family, and sizes spanning what the badge scales produce. Overlapping
	// shapes are where a naive union mask would have drifted, so families with
	// several shapes are the ones that matter.
	for _, family := range []string{
		"anime", "animation", "horror", "documentary", "comedy", "romance",
		"action", "scifi", "fantasy", "crime", "other",
	} {
		for _, size := range []int{12, 24, 37, 60} {
			got := image.NewNRGBA(image.Rect(0, 0, size+8, size+8))
			want := image.NewNRGBA(image.Rect(0, 0, size+8, size+8))
			drawGenreIcon(got, family, accent, dark, 4, 4, size)
			referenceGenreIcon(want, family, accent, dark, 4, 4, size)
			if !bytes.Equal(got.Pix, want.Pix) {
				t.Errorf("%s at size %d differs from the uncached rasteriser", family, size)
			}
		}
	}

	// A translucent colour is the outline's case: it draws the glyph flat in one
	// colour at a reduced alpha, once per offset.
	faint := color.NRGBA{R: 255, G: 255, B: 255, A: 70}
	got := image.NewNRGBA(image.Rect(0, 0, 48, 48))
	want := image.NewNRGBA(image.Rect(0, 0, 48, 48))
	drawGenreIcon(got, "scifi", faint, faint, 4, 4, 40)
	referenceGenreIcon(want, "scifi", faint, faint, 4, 4, 40)
	if !bytes.Equal(got.Pix, want.Pix) {
		t.Error("a translucent flat draw differs from the uncached rasteriser")
	}
}

func BenchmarkGenreIconOutline(b *testing.B) {
	dst := image.NewNRGBA(image.Rect(0, 0, 80, 80))
	outline := color.NRGBA{R: 0, G: 0, B: 0, A: 200}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// The reported configuration: width 2 with soften on.
		drawGenreIconOutline(dst, "scifi", outline, 4, 4, 60, 2, true)
	}
}

// BenchmarkGenreIconOutlineUncached replays the old cost: the outline redrawing
// the whole glyph from primitives once per offset.
func BenchmarkGenreIconOutlineUncached(b *testing.B) {
	dst := image.NewNRGBA(image.Rect(0, 0, 80, 80))
	outline := color.NRGBA{R: 0, G: 0, B: 0, A: 200}
	const width = 2
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for dx := -width; dx <= width; dx++ {
			for dy := -width; dy <= width; dy++ {
				if dx == 0 && dy == 0 {
					continue
				}
				referenceGenreIcon(dst, "scifi", outline, outline, 4+dx, 4+dy, 60)
			}
		}
	}
}
