package compose

import (
	"bytes"
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// A control the configurator offers and stores, which the renderer then skips
// because of some other setting, reads to the user as a dead switch. These pin
// the three that were reported together.

func TestSourceTintOutlinesEveryBadgeStyle(t *testing.T) {
	p := effectPipeline()
	styles := []imageconfig.BadgeStyle{
		imageconfig.BadgePill,
		imageconfig.BadgeSquare,
		imageconfig.BadgeTile,
		imageconfig.BadgeStacked,
		imageconfig.BadgeGlass,
		imageconfig.BadgePlain,
	}
	for _, style := range styles {
		t.Run(string(style), func(t *testing.T) {
			off := maximalConfig()
			off.BadgeStyle = style
			off.RatingBadgeBorderColor = ""
			on := off
			on.RatingBadgeBorderSourceTint = true

			if bytes.Equal(renderOne(t, p, off, "movie", "poster"), renderOne(t, p, on, "movie", "poster")) {
				t.Errorf("source-tint outline changes nothing on the %s style", style)
			}
		})
	}
}

func TestSingleRowKeepsTheTopLayout(t *testing.T) {
	ratings := []provider.Rating{
		{Source: "imdb", Value: 8.4, Label: "8.4"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
		{Source: "rt", Value: 9.1, Label: "91%"},
	}

	// The vertical midpoint of everything the strip drew. A top strip sits in the
	// upper half of the poster whatever else is on it.
	midpoint := func(layout imageconfig.RatingsLayout) int {
		cfg := imageconfig.Default()
		cfg.RatingsLayout = layout
		cfg.BottomRatingsRow = true
		img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
		drawBadgesInPlace(img, ratings, cfg)

		top, bottom := -1, -1
		for y := img.Bounds().Min.Y; y < img.Bounds().Max.Y; y++ {
			for x := img.Bounds().Min.X; x < img.Bounds().Max.X; x++ {
				if img.NRGBAAt(x, y).A == 0 {
					continue
				}
				if top < 0 {
					top = y
				}
				bottom = y
				break
			}
		}
		if top < 0 {
			t.Fatalf("layout %q drew no badges at all", layout)
		}
		return (top + bottom) / 2
	}

	if mid := midpoint(imageconfig.LayoutTop); mid >= 375 {
		t.Errorf("ratings layout Top drew its row at y=%d, in the bottom half of a 750px poster", mid)
	}
	if mid := midpoint(imageconfig.LayoutBottom); mid < 375 {
		t.Errorf("ratings layout Bottom drew its row at y=%d, in the top half of a 750px poster", mid)
	}
}

func TestEdgeInsetMovesTheRatingStrip(t *testing.T) {
	ratings := []provider.Rating{
		{Source: "imdb", Value: 8.4, Label: "8.4"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
	}

	draw := func(inset int) []byte {
		cfg := imageconfig.Default()
		cfg.PosterEdgeOffset = inset
		img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
		drawBadgesInPlace(img, ratings, cfg)
		return img.Pix
	}

	if bytes.Equal(draw(0), draw(30)) {
		t.Error("edge inset does not move the rating strip on a poster")
	}
}

func TestAnimeGroupingReachesTheGenreList(t *testing.T) {
	genres := []string{"Animation", "Action", "Drama"}

	draw := func(grouping string) []byte {
		img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
		drawGenreBadge(img, genres, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode:     "text",
			isAnime:  true,
			grouping: grouping,
		})
		return img.Pix
	}

	split, animation, secondary := draw(""), draw("animation"), draw("secondary")
	if bytes.Equal(split, animation) {
		t.Error("anime grouping 'as animation' draws the same genre list as 'own badge'")
	}
	if bytes.Equal(split, secondary) {
		t.Error("anime grouping 'next genre' draws the same genre list as 'own badge'")
	}
}

func TestGenreBorderWidthReachesTheTileStyle(t *testing.T) {
	draw := func(width float64) []byte {
		img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
		drawGenreBadge(img, []string{"Action"}, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode:        "text",
			style:       "tile",
			borderWidth: width,
		})
		return img.Pix
	}

	if bytes.Equal(draw(0), draw(4)) {
		t.Error("genre border width changes nothing on the tile style")
	}
}

func TestGroupAnimeGenres(t *testing.T) {
	tests := []struct {
		name     string
		genres   []string
		isAnime  bool
		grouping string
		want     []string
	}{
		{"own badge names an anime title", []string{"Animation", "Action"}, true, "", []string{"Anime", "Action"}},
		{"own badge leaves a cartoon alone", []string{"Animation", "Action"}, false, "", []string{"Animation", "Action"}},
		{"as animation folds anime in", []string{"Anime", "Action"}, true, "animation", []string{"Animation", "Action"}},
		{"next genre drops the animated tags", []string{"Anime", "Animation", "Action"}, true, "secondary", []string{"Action"}},
		{"next genre keeps something to show", []string{"Animation"}, true, "secondary", []string{"Animation"}},
		{"a duplicate collapses to one", []string{"Anime", "Animation"}, true, "", []string{"Anime"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := groupAnimeGenres(tc.genres, tc.isAnime, tc.grouping)
			if len(got) != len(tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("got %v, want %v", got, tc.want)
				}
			}
		})
	}
}
