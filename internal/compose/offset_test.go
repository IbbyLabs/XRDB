package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func topLeftInk(img *image.NRGBA) (minX, minY int) {
	minX, minY = 1<<30, 1<<30
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y).A > 60 {
				if x < minX {
					minX = x
				}
				if y < minY {
					minY = y
				}
			}
		}
	}
	return minX, minY
}

func TestRingOffsetMovesTheRing(t *testing.T) {
	ensureFaces()
	ratings := []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}
	base := imageconfig.Default()
	base.Ratings = []string{"imdb"}
	base.RatingRing = true
	base.RatingRingPos = "tl"

	shifted := base
	shifted.RingOffsetX = 40
	shifted.RingOffsetY = 30

	a := image.NewNRGBA(image.Rect(0, 0, 400, 600))
	drawAverageRatingRing(a, ratings, base, 2.0, newOccupancy(a.Bounds()))
	b := image.NewNRGBA(image.Rect(0, 0, 400, 600))
	drawAverageRatingRing(b, ratings, shifted, 2.0, newOccupancy(b.Bounds()))

	ax, ay := topLeftInk(a)
	bx, by := topLeftInk(b)
	if bx <= ax || by <= ay {
		t.Errorf("ring offset did not move it: base (%d,%d) shifted (%d,%d)", ax, ay, bx, by)
	}
}

func TestAgeRatingOffsetMovesTheBadge(t *testing.T) {
	ensureFaces()
	base := imageconfig.Default()
	shifted := ageOptsFromConfig(func() imageconfig.Config { c := base; c.AgeRatingOffsetX = 40; c.AgeRatingOffsetY = 30; return c }())

	a := image.NewNRGBA(image.Rect(0, 0, 400, 600))
	drawAgeRatingBadge(a, "PG-13", "tl", 2.0, newOccupancy(a.Bounds()), ageOptsFromConfig(base))
	b := image.NewNRGBA(image.Rect(0, 0, 400, 600))
	drawAgeRatingBadge(b, "PG-13", "tl", 2.0, newOccupancy(b.Bounds()), shifted)

	ax, ay := topLeftInk(a)
	bx, by := topLeftInk(b)
	if bx <= ax || by <= ay {
		t.Errorf("age badge offset did not move it: base (%d,%d) shifted (%d,%d)", ax, ay, bx, by)
	}
}

func TestAgeRatingScaleResizesTheBadge(t *testing.T) {
	ensureFaces()
	base := imageconfig.Default()
	big := base
	big.AgeRatingScale = 200

	measure := func(cfg imageconfig.Config) int {
		img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
		drawAgeRatingBadge(img, "PG-13", "tl", 2.0, newOccupancy(img.Bounds()), ageOptsFromConfig(cfg))
		n := 0
		b := img.Bounds()
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				if img.NRGBAAt(x, y).A > 60 {
					n++
				}
			}
		}
		return n
	}
	if measure(big) <= measure(base) {
		t.Error("ageRatingScale 200 did not enlarge the badge")
	}
}
