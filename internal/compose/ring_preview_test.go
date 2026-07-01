package compose

import (
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"strconv"
	"testing"
)

// ratingRingCases enumerates representative scores for both the coverage
// assertions and the optional visual sheet.
var ratingRingCases = []struct {
	caption string
	avg     float64
	hex     string
}{
	{"9.2 custom #f5c518", 9.2, "#f5c518"},
	{"9.2 auto (green)", 9.2, ""},
	{"7.8 auto (lime)", 7.8, ""},
	{"6.5 auto (amber)", 6.5, ""},
	{"4.5 auto (red)", 4.5, ""},
	{"2.0 auto (deep red)", 2.0, ""},
	{"10 auto (full circle)", 10.0, ""},
}

// TestRatingRingStyles asserts that the rating ring draws for every score band
// and — when RING_OUT names a path — also writes a comparison PNG so the
// design can be eyeballed:
//
//	RING_OUT=/path/sheet.png go test ./internal/compose -run TestRatingRingStyles
func TestRatingRingStyles(t *testing.T) {
	const scale = 2.0
	const tile = 240

	ensureFaces()
	face := valueFaceFor(scale)
	outerR := int(32 * scale)

	seen := map[[4]uint64]string{}
	render := func(avg float64, hex string) *image.NRGBA {
		card := image.NewNRGBA(image.Rect(0, 0, tile, tile))
		paintBackdropGradient(card)
		fill := ratingRingFillColor(avg, hex)
		label := strconv.Itoa(int(math.Round(avg * 10)))
		drawProgressRing(card, tile/2, tile/2, outerR, avg/10.0, fill, face, label)
		return card
	}
	for _, tc := range ratingRingCases {
		blank := image.NewNRGBA(image.Rect(0, 0, tile, tile))
		paintBackdropGradient(blank)
		card := render(tc.avg, tc.hex)
		if clonePixels(card) == clonePixels(blank) {
			t.Errorf("rating ring %q drew nothing", tc.caption)
		}
		key := clonePixels(card)
		if prev, ok := seen[key]; ok {
			t.Errorf("rating ring %q rendered identically to %q", tc.caption, prev)
		} else {
			seen[key] = tc.caption
		}
	}

	out := os.Getenv("RING_OUT")
	if out == "" {
		return
	}

	sheet := image.NewNRGBA(image.Rect(0, 0, tile*len(ratingRingCases), tile))
	for i, tc := range ratingRingCases {
		blit(sheet, render(tc.avg, tc.hex), i*tile, 0)
		for y := 0; y < tile; y++ { // 1px divider between cards
			sheet.SetNRGBA((i+1)*tile-1, y, color.NRGBA{R: 0, G: 0, B: 0, A: 120})
		}
	}

	f, err := os.Create(out)
	if err != nil {
		t.Fatalf("create %s: %v", out, err)
	}
	defer f.Close()
	if err := png.Encode(f, sheet); err != nil {
		t.Fatalf("encode: %v", err)
	}
	t.Logf("wrote %s (%dx%d)", out, sheet.Bounds().Dx(), sheet.Bounds().Dy())
}
