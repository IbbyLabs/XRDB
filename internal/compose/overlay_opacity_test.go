package compose

import (
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// A badge composites over the poster. Writing a translucent colour outright
// instead leaves a hole: on the PNG path the delivered image is see-through
// there, and on the JPEG path alpha is dropped and the hole encodes as solid
// black.
func TestBadgesLeaveThePosterOpaque(t *testing.T) {
	opaque := func() *image.NRGBA {
		img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
		for y := 0; y < 600; y++ {
			for x := 0; x < 400; x++ {
				img.SetNRGBA(x, y, color.NRGBA{R: 230, G: 226, B: 218, A: 255})
			}
		}
		return img
	}

	cases := map[string]func(*image.NRGBA){
		"provider": func(b *image.NRGBA) {
			drawProviderBadges(b, []provider.WatchProvider{{ID: 8, Name: "Netflix"}}, 1, newOccupancy(b.Bounds()), providerBadgeOpts{})
		},
		"trending": func(b *image.NRGBA) {
			drawTrendingBadgeSurfaced(b, 1, newOccupancy(b.Bounds()), trendingArrowWord, "", "", "plain", trendingBadgeOpts{})
		},
		"trending-square": func(b *image.NRGBA) {
			drawTrendingBadgeSurfaced(b, 1, newOccupancy(b.Bounds()), trendingArrowWord, "", "", "square", trendingBadgeOpts{})
		},
		"genre": func(b *image.NRGBA) {
			drawGenreBadge(b, []string{"Action", "Adventure"}, "tc", 1, newOccupancy(b.Bounds()), genreBadgeOpts{style: "pill", borderWidth: 2})
		},
		"genre-glass": func(b *image.NRGBA) {
			drawGenreBadge(b, []string{"Action"}, "tc", 1, newOccupancy(b.Bounds()), genreBadgeOpts{style: "glass"})
		},
		"quality": func(b *image.NRGBA) {
			drawQualityBadges(b, []string{"4k", "hdr"}, 1, newOccupancy(b.Bounds()), qualityBadgeOpts{})
		},
		"age": func(b *image.NRGBA) {
			drawAgeRatingBadge(b, "TV-MA", "br", 1, newOccupancy(b.Bounds()), ageRatingOpts{})
		},
		"release-status": func(b *image.NRGBA) {
			drawReleaseStatusBadge(b, "digital", "tr", 1, newOccupancy(b.Bounds()), releaseStatusOpts{})
		},
		"stinger": func(b *image.NRGBA) {
			drawStingerBadge(b, provider.StingerInfo{PostCredits: true}, "bl", 1, newOccupancy(b.Bounds()), stingerBadgeOpts{})
		},
		"top-rated": func(b *image.NRGBA) {
			drawTopRatedBadge(b, 3, "tl", 1, newOccupancy(b.Bounds()), topRatedOpts{})
		},
		"awards": func(b *image.NRGBA) {
			drawAwardsBadge(b, provider.AwardSummary{Kind: "oscar", Won: true}, "tr", 1, newOccupancy(b.Bounds()), awardsBadgeOpts{})
		},
		"score-pill": func(b *image.NRGBA) {
			drawScorePill(b, 200, 480, "IMDb", "8.4", nil, scorePillStyle{}, 1, newOccupancy(b.Bounds()))
		},
	}

	// The bottom ratings strip, in each badge style it offers.
	strip := []provider.Rating{
		{Source: "imdb", Value: 8.5, Label: "8.5"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
	}
	// A configured icon shape draws a plate behind each mark, which is a fill of
	// its own and so needs the same check.
	for _, shape := range []string{"circle", "squircle", "rounded"} {
		cases["ratings-icon-"+shape] = func(b *image.NRGBA) {
			drawBadgesInPlace(b, strip, imageconfig.Config{
				Ratings:           []string{"imdb", "tmdb"},
				RatingsLayout:     imageconfig.LayoutBottom,
				BadgeStyle:        imageconfig.BadgePill,
				BadgeTheme:        imageconfig.ThemeDark,
				RatingBadgeConfig: imageconfig.RatingBadgeConfig{IconShape: shape},
			}, titleFacts{})
		}
	}

	// Every BadgeStyle the config accepts, against both themes.
	for _, style := range imageconfig.BadgeStyles {
		for _, theme := range []imageconfig.BadgeTheme{imageconfig.ThemeDark, imageconfig.ThemeLight} {
			cases["ratings-"+string(style)+"-"+string(theme)] = func(b *image.NRGBA) {
				drawBadgesInPlace(b, strip, imageconfig.Config{
					Ratings:       []string{"imdb", "tmdb"},
					RatingsLayout: imageconfig.LayoutBottom,
					BadgeStyle:    style,
					BadgeTheme:    theme,
				}, titleFacts{})
			}
		}
	}

	for name, draw := range cases {
		t.Run(name, func(t *testing.T) {
			img := opaque()
			draw(img)
			holes, lowest := 0, 255
			var fx, fy int
			for y := 0; y < 600; y++ {
				for x := 0; x < 400; x++ {
					if a := int(img.NRGBAAt(x, y).A); a < 255 {
						if holes == 0 {
							fx, fy = x, y
						}
						holes++
						if a < lowest {
							lowest = a
						}
					}
				}
			}
			if holes > 0 {
				t.Errorf("%d non-opaque pixels, lowest alpha %d, first at (%d,%d)", holes, lowest, fx, fy)
			}
		})
	}
}
