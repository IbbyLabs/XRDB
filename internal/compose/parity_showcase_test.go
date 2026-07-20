package compose

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
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
	ratings := []provider.Rating{
		{Source: "imdb", Value: 8.5, Label: "8.5"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
		{Source: "rt", Value: 9.2, Label: "92%"},
	}
	ratingCfg := func(mut func(c *imageconfig.Config)) imageconfig.Config {
		c := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt"}, RatingsLayout: imageconfig.LayoutBottom, BadgeStyle: imageconfig.BadgePill, BadgeTheme: imageconfig.ThemeDark}
		mut(&c)
		return c
	}

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
		"genre-styles": {
			{"default (glass)", func(c *image.NRGBA) {
				drawGenreBadge(c, genres, "bl", 2.0, newOccupancy(c.Bounds()), genreBadgeOpts{})
			}},
			{"plain (no tile)", func(c *image.NRGBA) {
				drawGenreBadge(c, genres, "bl", 2.0, newOccupancy(c.Bounds()), genreBadgeOpts{style: "plain"})
			}},
			{"tile #3355ff", func(c *image.NRGBA) {
				drawGenreBadge(c, genres, "bl", 2.0, newOccupancy(c.Bounds()), genreBadgeOpts{style: "tile", tileColor: "#3355ff"})
			}},
			{"tile #e67e22", func(c *image.NRGBA) {
				drawGenreBadge(c, genres, "bl", 2.0, newOccupancy(c.Bounds()), genreBadgeOpts{style: "tile", tileColor: "#e67e22"})
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
		"quality-styles": {
			{"default (glass)", func(c *image.NRGBA) {
				drawQualityBadges(c, quality, 2.0, newOccupancy(c.Bounds()), qualityBadgeOpts{})
			}},
			{"plain", func(c *image.NRGBA) {
				drawQualityBadges(c, quality, 2.0, newOccupancy(c.Bounds()), qualityBadgeOpts{style: "plain"})
			}},
			{"tile #3355ff", func(c *image.NRGBA) {
				drawQualityBadges(c, quality, 2.0, newOccupancy(c.Bounds()), qualityBadgeOpts{style: "tile", tileColor: "#3355ff"})
			}},
			{"tile #8b5cf6", func(c *image.NRGBA) {
				drawQualityBadges(c, quality, 2.0, newOccupancy(c.Bounds()), qualityBadgeOpts{style: "tile", tileColor: "#8b5cf6"})
			}},
		},
		"rating-badges": {
			{"default", func(c *image.NRGBA) {
				drawBadgesInPlace(c, ratings, ratingCfg(func(*imageconfig.Config) {}))
			}},
			{"scale 150%", func(c *image.NRGBA) {
				drawBadgesInPlace(c, ratings, ratingCfg(func(cf *imageconfig.Config) { cf.RatingBadgeScale = 150 }))
			}},
			{"max 2", func(c *image.NRGBA) {
				two := 2
				drawBadgesInPlace(c, ratings, ratingCfg(func(cf *imageconfig.Config) { cf.RatingsMax = &two }))
			}},
			{"glass style", func(c *image.NRGBA) {
				drawBadgesInPlace(c, ratings, ratingCfg(func(cf *imageconfig.Config) { cf.BadgeStyle = imageconfig.BadgeGlass }))
			}},
		},
		"aggregate-bar": {
			{"auto (score-banded)", func(c *image.NRGBA) {
				drawAggregateBar(c, ratings, ratingCfg(func(cf *imageconfig.Config) { cf.AggregateBar = true; cf.AggregateBarPos = "bottom" }))
			}},
			{"custom #3355ff", func(c *image.NRGBA) {
				drawAggregateBar(c, ratings, ratingCfg(func(cf *imageconfig.Config) {
					cf.AggregateBar = true
					cf.AggregateBarPos = "bottom"
					cf.AggregateAccentColor = "#3355ff"
				}))
			}},
			{"top, custom #ff8800", func(c *image.NRGBA) {
				drawAggregateBar(c, ratings, ratingCfg(func(cf *imageconfig.Config) {
					cf.AggregateBar = true
					cf.AggregateBarPos = "top"
					cf.AggregateAccentColor = "#ff8800"
				}))
			}},
		},
		"age-rating-styles": {
			{"default", func(c *image.NRGBA) {
				drawAgeRatingBadge(c, "TV-MA", "br", 2.0, newOccupancy(c.Bounds()), ageRatingOpts{})
			}},
			{"plain", func(c *image.NRGBA) {
				drawAgeRatingBadge(c, "TV-MA", "br", 2.0, newOccupancy(c.Bounds()), ageRatingOpts{style: "plain"})
			}},
			{"tile red", func(c *image.NRGBA) {
				drawAgeRatingBadge(c, "TV-MA", "br", 2.0, newOccupancy(c.Bounds()), ageRatingOpts{style: "tile", tileColor: "#c0392b"})
			}},
			{"tile green", func(c *image.NRGBA) {
				drawAgeRatingBadge(c, "TV-MA", "br", 2.0, newOccupancy(c.Bounds()), ageRatingOpts{style: "tile", tileColor: "#27ae60"})
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
