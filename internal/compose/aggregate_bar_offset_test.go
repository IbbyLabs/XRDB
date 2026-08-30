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
