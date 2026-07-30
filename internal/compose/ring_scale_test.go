package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// paintedPixels counts how many pixels the draw touched, which is the ring's
// footprint. "The render changed" is too weak here: a differently placed ring of
// the same size satisfies it while the ring stays the size nobody could read.
func paintedPixels(img *image.NRGBA) int {
	n := 0
	for i := 0; i < len(img.Pix); i += 4 {
		if img.Pix[i+3] != 0 {
			n++
		}
	}
	return n
}

func TestRingScaleResizesTheRing(t *testing.T) {
	ratings := []provider.Rating{{Source: "imdb", Value: 8.0, Label: "8.0"}}
	base := imageconfig.Config{Ratings: []string{"imdb"}, RatingRing: true, RatingRingPos: "br"}

	paint := func(cfg imageconfig.Config) int {
		img := genreTestImage()
		drawAverageRatingRing(img, ratings, cfg, 2.0, newOccupancy(img.Bounds()))
		return paintedPixels(img)
	}

	def := paint(base)
	if def == 0 {
		t.Fatal("the default ring drew nothing")
	}

	bigger := base
	bigger.RingScale = 200
	if got := paint(bigger); got <= def {
		t.Errorf("ringScale 200 painted %d pixels, want more than the default %d", got, def)
	}

	smaller := base
	smaller.RingScale = 70
	if got := paint(smaller); got >= def {
		t.Errorf("ringScale 70 painted %d pixels, want fewer than the default %d", got, def)
	}
}
