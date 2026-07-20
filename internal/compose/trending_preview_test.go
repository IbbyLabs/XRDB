package compose

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"
)

// trendingStyleCases enumerates every trending badge composition for both the
// coverage assertions and the optional visual sheet.
var trendingStyleCases = []struct {
	caption string
	style   trendingStyle
}{
	{"A - rising arrow + word  (default)", trendingArrowWord},
	{"B - flame + word", trendingFlameWord},
	{"C - word only", trendingWordOnly},
	{"D - rising arrow only", trendingArrowOnly},
	{"E - flame only", trendingFlameOnly},
}

// TestTrendingStyles asserts that every trending badge style actually draws,
// and — when TRENDING_OUT names a path — also writes a comparison PNG so the
// design can be eyeballed:
//
//	TRENDING_OUT=/path/sheet.png go test ./internal/compose -run TestTrendingStyles
func TestTrendingStyles(t *testing.T) {
	const scale = 2.0
	const cardW, cardH = 780, 112

	seen := map[[4]uint64]string{}
	for _, tc := range trendingStyleCases {
		card := image.NewNRGBA(image.Rect(0, 0, cardW, cardH))
		paintBackdropGradient(card)
		before := clonePixels(card)
		drawTrendingBadgeStyled(card, scale, newOccupancy(card.Bounds()), tc.style, "")
		after := clonePixels(card)
		if after == before {
			t.Errorf("trending style %q drew nothing", tc.caption)
		}
		if prev, ok := seen[after]; ok {
			t.Errorf("trending style %q rendered identically to %q", tc.caption, prev)
		} else {
			seen[after] = tc.caption
		}
	}

	out := os.Getenv("TRENDING_OUT")
	if out == "" {
		return
	}

	ensureFaces()
	capFace := labelFaceFor(1.0) // small annotation text, independent of badge scale
	sheet := image.NewNRGBA(image.Rect(0, 0, cardW, cardH*len(trendingStyleCases)))
	for i, tc := range trendingStyleCases {
		card := image.NewNRGBA(image.Rect(0, 0, cardW, cardH))
		paintBackdropGradient(card)
		drawTrendingBadgeStyled(card, scale, newOccupancy(card.Bounds()), tc.style, "")
		if capFace != nil {
			drawText(card, capFace, 350, cardH/2+capFace.Metrics().Ascent.Ceil()/2-4,
				color.NRGBA{R: 152, G: 160, B: 172, A: 255}, tc.caption)
		}
		blit(sheet, card, 0, i*cardH)
		for x := 0; x < cardW; x++ { // 1px divider between cards
			sheet.SetNRGBA(x, (i+1)*cardH-1, color.NRGBA{R: 0, G: 0, B: 0, A: 120})
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

// paintBackdropGradient fills img with a dark blue-grey vertical gradient that
// approximates a poster backdrop, so the frosted capsule reads correctly.
func paintBackdropGradient(img *image.NRGBA) {
	b := img.Bounds()
	top := [3]float64{29, 41, 56}
	bot := [3]float64{14, 20, 29}
	h := float64(b.Dy())
	for y := b.Min.Y; y < b.Max.Y; y++ {
		t := float64(y-b.Min.Y) / h
		r := uint8(top[0] + (bot[0]-top[0])*t)
		g := uint8(top[1] + (bot[1]-top[1])*t)
		bl := uint8(top[2] + (bot[2]-top[2])*t)
		for x := b.Min.X; x < b.Max.X; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: r, G: g, B: bl, A: 255})
		}
	}
}

// blit copies src onto dst with its top-left at (ox, oy).
func blit(dst, src *image.NRGBA, ox, oy int) {
	sb := src.Bounds()
	for y := sb.Min.Y; y < sb.Max.Y; y++ {
		for x := sb.Min.X; x < sb.Max.X; x++ {
			dst.SetNRGBA(ox+x, oy+y, src.NRGBAAt(x, y))
		}
	}
}
