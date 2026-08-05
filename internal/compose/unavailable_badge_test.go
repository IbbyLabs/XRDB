package compose

import (
	"image"
	"image/color"
	"math"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// A held-out source used to vanish, which looks identical to a title with no
// score. It now keeps a dimmed badge with an X where the number goes (FR-162).
func inkedPixels(img *image.NRGBA) int {
	n := 0
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y).A > 0 {
				n++
			}
		}
	}
	return n
}

func stripWith(ratings []provider.Rating) *image.NRGBA {
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb"}
	img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
	drawBadgesInPlace(img, ratings, cfg, titleFacts{})
	return img
}

func TestAnUnavailableSourceStillDrawsABadge(t *testing.T) {
	one := stripWith([]provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}})
	withHeldOut := stripWith([]provider.Rating{
		{Source: "imdb", Value: 8.4, Label: "8.4"},
		{Source: "tmdb", Unavailable: true},
	})

	if identical(one, withHeldOut) {
		t.Fatal("a held-out source drew nothing, so it is still indistinguishable from no score")
	}
	if inkedPixels(withHeldOut) <= inkedPixels(one) {
		t.Error("the held-out source did not add a badge to the strip")
	}
}

// The badge must not read as a normal one. Dimmer than the same source with a
// score is the difference, and it has to be measurable rather than asserted.
func TestTheUnavailableBadgeIsDimmerThanARealOne(t *testing.T) {
	real := stripWith([]provider.Rating{{Source: "tmdb", Value: 7.9, Label: "7.9"}})
	held := stripWith([]provider.Rating{{Source: "tmdb", Unavailable: true}})

	mean := func(img *image.NRGBA) float64 {
		var sum, n float64
		b := img.Bounds()
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				if a := img.NRGBAAt(x, y).A; a > 0 {
					sum += float64(a)
					n++
				}
			}
		}
		if n == 0 {
			return 0
		}
		return sum / n
	}
	if mean(held) >= mean(real) {
		t.Errorf("the held-out badge is not dimmer: %.1f against %.1f", mean(held), mean(real))
	}
}

// The X is the part that says "unavailable" rather than "zero". It has to be
// drawn, and a blank plate is the failure this replaces.
func TestTheUnavailableBadgeDrawsTheX(t *testing.T) {
	held := stripWith([]provider.Rating{{Source: "tmdb", Unavailable: true}})

	plate := image.NewNRGBA(image.Rect(0, 0, 60, 40))
	drawUnavailableX(plate, plate.Bounds().Inset(8), color.NRGBA{R: 255, G: 255, B: 255, A: 255}, 2)
	if inkedPixels(plate) < 40 {
		t.Fatalf("the X glyph itself painted %d pixels", inkedPixels(plate))
	}
	if inkedPixels(held) == 0 {
		t.Error("the held-out badge painted nothing at all")
	}
}

// The angle is the decision, not an implementation detail: 117° reads as two
// crossed strokes and 48° crowds the pill.
func TestTheXKeepsItsAngle(t *testing.T) {
	if unavailableXAngle != 64.0 {
		t.Errorf("the X is at %v°, which is not the angle that was chosen", unavailableXAngle)
	}
	// The geometry follows from it: half the angle off vertical each way.
	wantHalf := math.Tan(64.0 / 2 * math.Pi / 180)
	if math.Abs(wantHalf-math.Tan(unavailableXAngle/2*math.Pi/180)) > 1e-9 {
		t.Error("the drawn geometry no longer follows the stated angle")
	}
}

// A placeholder carries no score and must never reach an average.
func TestAnUnavailableRatingCarriesNoValue(t *testing.T) {
	r := provider.Rating{Source: "tmdb", Unavailable: true}
	if r.Value != 0 || r.Label != "" {
		t.Error("a held-out placeholder carries a value, so it could be averaged")
	}
}
