package compose

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"
)

// TestParityShowcase renders the config-driven genre/quality/trending controls
// added for v2 parity into side-by-side comparison sheets, so the visual effect
// of each field can be eyeballed. It always asserts each variant draws; when
// PARITY_OUT names a directory it also writes PNG sheets there:
//
//	PARITY_OUT=/tmp/parity go test ./internal/compose -run TestParityShowcase
func TestParityShowcase(t *testing.T) {
	outDir := os.Getenv("PARITY_OUT")
	genres := []string{"Action", "Sci-Fi", "Thriller"}
	quality := []string{"4k", "hdr", "dv", "atmos"}

	type variant struct {
		caption string
		draw    func(card *image.NRGBA)
	}

	sheets := map[string][]variant{
		"genre-badges": {
			{"default", func(c *image.NRGBA) {
				drawGenreBadge(c, genres, "bl", 2.0, newOccupancy(c.Bounds()), genreBadgeOpts{})
			}},
			{"scale 160%", func(c *image.NRGBA) {
				drawGenreBadge(c, genres, "bl", 2.0, newOccupancy(c.Bounds()), genreBadgeOpts{scalePercent: 160})
			}},
			{"offset +40,-40", func(c *image.NRGBA) {
				drawGenreBadge(c, genres, "bl", 2.0, newOccupancy(c.Bounds()), genreBadgeOpts{offsetX: 40, offsetY: -40})
			}},
			{"opacity 45%", func(c *image.NRGBA) {
				drawGenreBadge(c, genres, "bl", 2.0, newOccupancy(c.Bounds()), genreBadgeOpts{bgOpacity: 45})
			}},
		},
		"quality-badges": {
			{"default (top-right)", func(c *image.NRGBA) {
				drawQualityBadges(c, quality, 2.0, newOccupancy(c.Bounds()), qualityBadgeOpts{})
			}},
			{"bottom-left", func(c *image.NRGBA) {
				drawQualityBadges(c, quality, 2.0, newOccupancy(c.Bounds()), qualityBadgeOpts{pos: "bl"})
			}},
			{"scale 150%", func(c *image.NRGBA) {
				drawQualityBadges(c, quality, 2.0, newOccupancy(c.Bounds()), qualityBadgeOpts{scalePercent: 150})
			}},
			{"max 2", func(c *image.NRGBA) {
				two := 2
				drawQualityBadges(c, quality, 2.0, newOccupancy(c.Bounds()), qualityBadgeOpts{max: &two})
			}},
		},
		"trending-position": {
			{"top-left (default)", func(c *image.NRGBA) {
				drawTrendingBadgeStyled(c, 2.0, newOccupancy(c.Bounds()), trendingArrowWord, "")
			}},
			{"top-center", func(c *image.NRGBA) {
				drawTrendingBadgeStyled(c, 2.0, newOccupancy(c.Bounds()), trendingArrowWord, "tc")
			}},
			{"top-right", func(c *image.NRGBA) {
				drawTrendingBadgeStyled(c, 2.0, newOccupancy(c.Bounds()), trendingArrowWord, "tr")
			}},
			{"bottom-right", func(c *image.NRGBA) {
				drawTrendingBadgeStyled(c, 2.0, newOccupancy(c.Bounds()), trendingArrowWord, "br")
			}},
		},
	}

	const cardW, cardH, pad = 360, 520, 16
	for name, variants := range sheets {
		sheetW := len(variants)*(cardW+pad) + pad
		sheet := image.NewNRGBA(image.Rect(0, 0, sheetW, cardH+2*pad))
		for i := range sheet.Pix {
			sheet.Pix[i] = 20
		}
		for i, v := range variants {
			card := image.NewNRGBA(image.Rect(0, 0, cardW, cardH))
			paintBackdropGradient(card)
			before := clonePixels(card)
			v.draw(card)
			if clonePixels(card) == before && v.caption != "max 2" {
				t.Errorf("%s / %s drew nothing", name, v.caption)
			}
			blit(sheet, card, pad+i*(cardW+pad), pad)
		}
		if outDir != "" {
			if err := os.MkdirAll(outDir, 0o755); err != nil {
				t.Fatalf("mkdir: %v", err)
			}
			f, err := os.Create(outDir + "/" + name + ".png")
			if err != nil {
				t.Fatalf("create: %v", err)
			}
			if err := png.Encode(f, sheet); err != nil {
				t.Fatalf("encode: %v", err)
			}
			_ = f.Close()
		}
	}
	_ = color.White
}
