package compose

import (
	"image"
	"testing"
)

// Fill, border and outline used to be exposed on whichever style happened to
// read the field first, with no pattern a user could predict: genre's tile
// style coloured its fill and drew no border, while genre's plain style
// coloured an outline and had no capsule to fill. These prove that every
// bordered style across every badge family now answers the same accent
// field the tile style's fill already did, and every plain (no-background)
// style answers the same outline field.

func TestGenreBorderedStylesTakeTheAccentColour(t *testing.T) {
	for _, style := range []string{"square", "glass", "default"} {
		t.Run(style, func(t *testing.T) {
			s := style
			if s == "default" {
				s = ""
			}
			draw := func(opts genreBadgeOpts) *image.NRGBA {
				base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
				drawGenreBadge(base, []string{"Drama"}, "bl", 1, newOccupancy(image.Rect(0, 0, 400, 200)), opts)
				return base
			}
			plain := draw(genreBadgeOpts{style: s})
			accented := draw(genreBadgeOpts{style: s, tileColor: "#00A99D"})
			if !imagesDiffer(plain, accented) {
				t.Errorf("%s style: setting the accent colour had no effect on the border", style)
			}
		})
	}
}

func TestQualityBorderedStylesTakeTheAccentColour(t *testing.T) {
	for _, style := range []string{"default", "plain"} {
		t.Run(style, func(t *testing.T) {
			s := style
			if s == "default" {
				s = ""
			}
			draw := func(opts qualityBadgeOpts) *image.NRGBA {
				base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
				drawQualityBadges(base, []string{"4k"}, 1, newOccupancy(image.Rect(0, 0, 400, 200)), opts)
				return base
			}
			plain := draw(qualityBadgeOpts{style: s})
			accented := draw(qualityBadgeOpts{style: s, tileColor: "#00A99D"})
			if !imagesDiffer(plain, accented) {
				t.Errorf("%s style: setting the accent colour had no effect", style)
			}
		})
	}
}

func TestAgeRatingBorderedStylesTakeTheAccentColour(t *testing.T) {
	for _, style := range []string{"default", "square", "silver"} {
		t.Run(style, func(t *testing.T) {
			s := style
			if s == "default" {
				s = ""
			}
			draw := func(opts ageRatingOpts) *image.NRGBA {
				base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
				drawAgeRatingBadge(base, "TV-MA", "br", 1, newOccupancy(image.Rect(0, 0, 400, 200)), opts)
				return base
			}
			plain := draw(ageRatingOpts{style: s})
			accented := draw(ageRatingOpts{style: s, tileColor: "#00A99D"})
			if !imagesDiffer(plain, accented) {
				t.Errorf("%s style: setting the tile colour had no effect on the border", style)
			}
		})
	}
}

func TestReleaseStatusBorderedStylesTakeTheAccentColour(t *testing.T) {
	for _, style := range []string{"default", "square", "silver"} {
		t.Run(style, func(t *testing.T) {
			s := style
			if s == "default" {
				s = ""
			}
			draw := func(opts releaseStatusOpts) *image.NRGBA {
				base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
				drawReleaseStatusBadge(base, "digital", "tr", 1, newOccupancy(image.Rect(0, 0, 400, 200)), opts)
				return base
			}
			plain := draw(releaseStatusOpts{style: s})
			accented := draw(releaseStatusOpts{style: s, tileColor: "#00A99D"})
			if !imagesDiffer(plain, accented) {
				t.Errorf("%s style: setting the tile colour had no effect on the border", style)
			}
		})
	}
}

func TestReleaseStatusPlainStyleTakesTheOutline(t *testing.T) {
	draw := func(opts releaseStatusOpts) *image.NRGBA {
		base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
		drawReleaseStatusBadge(base, "digital", "tr", 1, newOccupancy(image.Rect(0, 0, 400, 200)), opts)
		return base
	}
	shadow := draw(releaseStatusOpts{style: "plain"})
	outlined := draw(releaseStatusOpts{style: "plain", outlineColor: "#00A99D", outlineWidth: 2})
	if !imagesDiffer(shadow, outlined) {
		t.Error("the plain style's outline colour had no effect")
	}
}

func TestTopRatedBorderedStylesTakeTheAccentColour(t *testing.T) {
	for _, style := range []string{"default", "square", "silver"} {
		t.Run(style, func(t *testing.T) {
			s := style
			if s == "default" {
				s = ""
			}
			draw := func(opts topRatedOpts) *image.NRGBA {
				base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
				drawTopRatedBadge(base, 3, "tl", 1, newOccupancy(image.Rect(0, 0, 400, 200)), opts)
				return base
			}
			plain := draw(topRatedOpts{style: s})
			accented := draw(topRatedOpts{style: s, tileColor: "#00A99D"})
			if !imagesDiffer(plain, accented) {
				t.Errorf("%s style: setting the tile colour had no effect on the border", style)
			}
		})
	}
}

func TestTopRatedPlainStyleTakesTheOutline(t *testing.T) {
	draw := func(opts topRatedOpts) *image.NRGBA {
		base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
		drawTopRatedBadge(base, 3, "tl", 1, newOccupancy(image.Rect(0, 0, 400, 200)), opts)
		return base
	}
	shadow := draw(topRatedOpts{style: "plain"})
	outlined := draw(topRatedOpts{style: "plain", outlineColor: "#00A99D", outlineWidth: 2})
	if !imagesDiffer(shadow, outlined) {
		t.Error("the plain style's outline colour had no effect")
	}
}

func TestTrendingCapsuleTakesTheAccentColour(t *testing.T) {
	for _, surface := range []string{"", "square"} {
		t.Run("surface="+surface, func(t *testing.T) {
			draw := func(opts trendingBadgeOpts) *image.NRGBA {
				base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
				drawTrendingBadgeSurfaced(base, 1, newOccupancy(image.Rect(0, 0, 400, 200)), trendingArrowWord, "", "", surface, opts)
				return base
			}
			plain := draw(trendingBadgeOpts{})
			accented := draw(trendingBadgeOpts{accentColor: "#00A99D"})
			if !imagesDiffer(plain, accented) {
				t.Error("setting the accent colour had no effect on the hairline border")
			}
		})
	}
}

func TestTrendingPlainSurfaceTakesTheOutline(t *testing.T) {
	draw := func(opts trendingBadgeOpts) *image.NRGBA {
		base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
		drawTrendingBadgeSurfaced(base, 1, newOccupancy(image.Rect(0, 0, 400, 200)), trendingArrowWord, "", "", "plain", opts)
		return base
	}
	shadowless := draw(trendingBadgeOpts{})
	outlined := draw(trendingBadgeOpts{outlineColor: "#00A99D", outlineWidth: 2})
	if !imagesDiffer(shadowless, outlined) {
		t.Error("the plain surface's outline colour had no effect")
	}
}
