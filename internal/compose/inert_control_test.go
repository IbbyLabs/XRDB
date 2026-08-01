package compose

import (
	"bytes"
	"fmt"
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
	draw := func(style string, width float64) *image.NRGBA {
		img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
		drawGenreBadge(img, []string{"Horror"}, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode:        "text",
			style:       style,
			borderWidth: width,
		})
		return img
	}

	if bytes.Equal(draw("tile", 0).Pix, draw("tile", 4).Pix) {
		t.Error("genre border width changes nothing on the tile style")
	}

	// A border draws at partial alpha over the plate, so its pixels are a blend
	// rather than the accent exactly. Count red-dominant pixels instead: the
	// white border it used to draw is neutral and contributes none.
	countAccent := func(img *image.NRGBA) int {
		n := 0
		b := img.Bounds()
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				c := img.NRGBAAt(x, y)
				if c.A > 0 && int(c.R) > int(c.G)+40 && int(c.R) > int(c.B)+40 {
					n++
				}
			}
		}
		return n
	}
	bare, bordered := countAccent(draw("tile", 0)), countAccent(draw("tile", 4))
	if bordered <= bare {
		t.Errorf("a border on the tile style adds no pixels in the genre's colour (%d with, %d without)", bordered, bare)
	}
}

// v2 coloured the genre label with the family's own accent on every style but
// clean (lib/imageRouteGenreBadge.ts: `isClean ? '#ffffff' : accentColor`), and
// gave the plate border the same colour.
func TestGenreLabelTakesTheFamilyAccent(t *testing.T) {
	// Comparing two genres proves nothing here: the labels are different words,
	// so the pixels differ whatever colour they are. Sample the drawn colours
	// instead and look for the family's own accent.
	const grey = "e1e1e4" // the fixed label colour these styles used to draw
	horror := "ef4444"    // familyHorror's accent

	drawn := func(style string) map[string]bool {
		img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
		drawGenreBadge(img, []string{"Horror"}, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode:  "text",
			style: style,
		})
		seen := map[string]bool{}
		b := img.Bounds()
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				if c := img.NRGBAAt(x, y); c.A == 255 {
					seen[fmt.Sprintf("%02x%02x%02x", c.R, c.G, c.B)] = true
				}
			}
		}
		return seen
	}

	for _, style := range []string{"", "tile", "square", "plain"} {
		name := style
		if name == "" {
			name = "capsule"
		}
		t.Run(name, func(t *testing.T) {
			seen := drawn(style)
			if !seen[horror] {
				t.Errorf("the %s genre badge never draws familyHorror's accent #%s, so the label is not taking it", name, horror)
			}
			if seen[grey] {
				t.Errorf("the %s genre badge still draws the fixed grey #%s", name, grey)
			}
		})
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

// A genre list is capped at three by count, so three long names ran off both
// edges of the poster while three short ones fitted (FR-138).
func TestGenreListDropsGenresRatherThanOverflow(t *testing.T) {
	long := []string{"Action & Adventure", "Animation", "Sci-Fi & Fantasy"}

	widest := func(img *image.NRGBA) (int, int) {
		lo, hi := -1, -1
		b := img.Bounds()
		for x := b.Min.X; x < b.Max.X; x++ {
			for y := b.Min.Y; y < b.Max.Y; y++ {
				if img.NRGBAAt(x, y).A > 0 {
					if lo < 0 {
						lo = x
					}
					hi = x
					break
				}
			}
		}
		return lo, hi
	}

	const w = 400
	img := image.NewNRGBA(image.Rect(0, 0, w, 600))
	drawGenreBadge(img, long, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{mode: "text"})
	lo, hi := widest(img)
	if lo < 0 {
		t.Fatal("the genre badge drew nothing")
	}
	// Overflow is clipped at the frame, so ink in the outermost column is the
	// signal: a badge that fits stops short of it.
	if lo == 0 || hi == w-1 {
		t.Errorf("the genre badge spans x=%d..%d on a %dpx poster, so it is clipped at the edge", lo, hi, w)
	}
}

// A translucent badge body has to composite over the artwork. Writing the pixel
// outright replaces it, so the badge shows the viewer's background rather than
// the poster underneath (FR-134).
func TestBadgeBackgroundOpacityLetsTheArtworkThrough(t *testing.T) {
	ratings := []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}

	draw := func(opacity int) *image.NRGBA {
		cfg := imageconfig.Default()
		cfg.RatingBadgeBackgroundOpacity = opacity
		img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
		// Opaque red stands in for artwork; anything the badge lets through
		// keeps a red channel the badge's own dark fill does not have.
		for i := 0; i < len(img.Pix); i += 4 {
			img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = 255, 0, 0, 255
		}
		drawBadgesInPlace(img, ratings, cfg)
		return img
	}

	// Every pixel starts opaque, so a hole is the failure: replacing the body
	// with a translucent fill drops the alpha.
	transparent, blended := 0, 0
	img := draw(30)
	for i := 0; i < len(img.Pix); i += 4 {
		if img.Pix[i+3] < 255 {
			transparent++
		}
		if r, g, b := img.Pix[i], img.Pix[i+1], img.Pix[i+2]; r > 40 && r < 250 && g < 60 && b < 60 {
			blended++
		}
	}
	if transparent > 0 {
		t.Errorf("%d badge pixels became translucent, so the body replaced the artwork instead of compositing over it", transparent)
	}
	if blended == 0 {
		t.Error("no badge pixel carries the artwork's colour, so nothing showed through")
	}
}
