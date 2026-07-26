package compose

import (
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func fillTestConfig(fill bool) imageconfig.Config {
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb"}
	cfg.RatingPresentation = "minimal"
	cfg.AggregateAccentMode = "dynamic"
	cfg.AggregateDynamicStops = "0:#1d4ed8,100:#db2777"
	cfg.AggregateFillByScore = fill
	return cfg
}

func fillTestImage() *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, 400, 200))
	for y := 0; y < 200; y++ {
		for x := 0; x < 400; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: 40, G: 44, B: 52, A: 255})
		}
	}
	return img
}

func renderMinimal(cfg imageconfig.Config, score float64) *image.NRGBA {
	img := fillTestImage()
	ratings := []provider.Rating{{Source: "imdb", Value: score}}
	drawMinimalRating(img, ratings, nil, false, cfg, 1.0, newOccupancy(img.Bounds()))
	return img
}

// Without the flag the aggregate pill stays a dark capsule whatever the score,
// which is what every existing profile expects.
func TestAggregateFillByScoreIsOptIn(t *testing.T) {
	low := pillBodyColor(t, renderMinimal(fillTestConfig(false), 2))
	high := pillBodyColor(t, renderMinimal(fillTestConfig(false), 9.5))
	if low != high {
		t.Errorf("score changed the unfilled pill body: %v vs %v", low, high)
	}
}

func TestAggregateFillByScoreColoursTheBody(t *testing.T) {
	low := renderMinimal(fillTestConfig(true), 2)
	high := renderMinimal(fillTestConfig(true), 9.5)
	if !imagesDiffer(low, high) {
		t.Fatal("a filled pill rendered the same at 2.0 and 9.5")
	}
	// The stops run blue to pink, so the body tracks the score across them.
	lowC, highC := pillBodyColor(t, low), pillBodyColor(t, high)
	if lowC.B <= lowC.R {
		t.Errorf("low score body %v is not on the blue end", lowC)
	}
	if highC.R <= highC.B {
		t.Errorf("high score body %v is not on the pink end", highC)
	}
}

// pillBodyColor samples the most common non-background colour, which is the
// capsule body.
func pillBodyColor(t *testing.T, img *image.NRGBA) color.NRGBA {
	t.Helper()
	bg := color.NRGBA{R: 40, G: 44, B: 52, A: 255}
	counts := map[color.NRGBA]int{}
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := img.NRGBAAt(x, y)
			if c == bg {
				continue
			}
			counts[c]++
		}
	}
	var best color.NRGBA
	most := 0
	for c, n := range counts {
		if n > most {
			best, most = c, n
		}
	}
	if most == 0 {
		t.Fatal("no pill drawn")
	}
	return best
}

func TestAggregatePillHonoursSquareBadgeStyle(t *testing.T) {
	cfg := fillTestConfig(false)
	round := renderMinimal(cfg, 8)
	cfg.BadgeStyle = imageconfig.BadgeSquare
	square := renderMinimal(cfg, 8)
	if !imagesDiffer(round, square) {
		t.Error("the square badge style did not change the aggregate pill")
	}
}
