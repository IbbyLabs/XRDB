package compose

import (
	"bytes"
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// A flat canvas, so any pixel that changes is the bar and nothing else.
func flatCanvas() *image.NRGBA {
	c := image.NewNRGBA(image.Rect(0, 0, 780, 1170))
	for y := c.Bounds().Min.Y; y < c.Bounds().Max.Y; y++ {
		for x := c.Bounds().Min.X; x < c.Bounds().Max.X; x++ {
			c.SetNRGBA(x, y, color.NRGBA{R: 40, G: 40, B: 40, A: 255})
		}
	}
	return c
}

func barAtOffset(offset int) *image.NRGBA {
	c := flatCanvas()
	ratings := []provider.Rating{
		{Source: "imdb", Value: 8.5, Label: "8.5"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
	}
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}}
	cfg.AggregateBar = true
	cfg.AggregateBarPos = "bottom"
	cfg.AggregateBarOffset = offset
	drawAggregateBar(c, ratings, cfg, nil, false)
	return c
}

// The offset reaches past the canvas at its bound, so the draw has to clip
// rather than fault. The zero case is the control: without it a bar that never
// draws at all would satisfy the clipping case.
func TestAggregateBarOffsetClipsAtItsBound(t *testing.T) {
	plain := flatCanvas()

	if bytes.Equal(barAtOffset(0).Pix, plain.Pix) {
		t.Fatal("no bar was drawn at offset 0, so the off-canvas case below proves nothing")
	}

	for _, offset := range []int{1200, -1200} {
		if !bytes.Equal(barAtOffset(offset).Pix, plain.Pix) {
			t.Errorf("offset %d left the bar on a 1170px canvas; expected it clear of the image", offset)
		}
	}
}

// The drawn height follows the configured percent. Row counting on a flat
// canvas rather than arithmetic, because the arithmetic is what is under test.
func TestAggregateBarScaleChangesTheDrawnHeight(t *testing.T) {
	rows := func(pct int) int {
		c := flatCanvas()
		ratings := []provider.Rating{
			{Source: "imdb", Value: 8.5, Label: "8.5"},
			{Source: "tmdb", Value: 7.9, Label: "7.9"},
		}
		cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}}
		cfg.AggregateBar = true
		cfg.AggregateBarPos = "bottom"
		cfg.AggregateBarScale = pct
		drawAggregateBar(c, ratings, cfg, nil, false)
		changed := 0
		for y := c.Bounds().Min.Y; y < c.Bounds().Max.Y; y++ {
			if c.NRGBAAt(c.Bounds().Min.X+1, y) != (color.NRGBA{R: 40, G: 40, B: 40, A: 255}) {
				changed++
			}
		}
		return changed
	}

	base := rows(0)
	if base == 0 {
		t.Fatal("the default drew nothing, so the comparisons below prove nothing")
	}
	if got := rows(100); got != base {
		t.Errorf("0 and 100 differ: %d vs %d, so zero is not meaning default", got, base)
	}
	if got := rows(200); got <= base {
		t.Errorf("200 percent drew %d rows against %d at the default", got, base)
	}
	if got := rows(50); got >= base {
		t.Errorf("50 percent drew %d rows against %d at the default", got, base)
	}
}
