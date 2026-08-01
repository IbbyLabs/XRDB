package compose

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
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

// The pill presentations draw their own capsule body, so the badge strip's
// opacity control has to reach them too or it is live on Standard and inert
// everywhere else — the shape BUG-183 was about.
func TestBadgeBackgroundOpacityReachesTheScorePills(t *testing.T) {
	p := effectPipeline()
	for _, presentation := range []string{"minimal", "average", "dual", "dual-minimal"} {
		t.Run(presentation, func(t *testing.T) {
			off := maximalConfig()
			off.RatingPresentation = presentation
			on := off
			on.RatingBadgeBackgroundOpacity = 30

			if bytes.Equal(renderOne(t, p, off, "movie", "poster"), renderOne(t, p, on, "movie", "poster")) {
				t.Errorf("badge background opacity changes nothing on the %s presentation", presentation)
			}
		})
	}
}

// The pill's drop shadow sits under nearly all of its body. Drawn opaquely it
// replaces the artwork, so a translucent capsule reveals a black slab rather
// than the poster the control exists to show.
func TestScorePillOpacityShowsArtworkNotItsOwnShadow(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingBadgeBackgroundOpacity = 20

	img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = 255, 0, 0, 255
	}
	style := aggregatePillStyle(cfg, "overall", nil, false, 8.4, color.NRGBA{R: 80, G: 80, B: 90, A: 255})
	drawAggregatePills(img, cfg, 1, newOccupancy(img.Bounds()), false, aggregatePill{
		score: "8.4", style: style,
	})

	// Anywhere the capsule sits, red should still dominate at 20% opacity. A
	// replaced pixel is near-black and loses it.
	red, dark := 0, 0
	for i := 0; i < len(img.Pix); i += 4 {
		r, g, b := img.Pix[i], img.Pix[i+1], img.Pix[i+2]
		if r == 255 && g == 0 && b == 0 {
			continue // untouched artwork
		}
		if int(r) > int(g)+30 && int(r) > int(b)+30 {
			red++
		} else if r < 60 && g < 60 && b < 60 {
			dark++
		}
	}
	if red == 0 {
		t.Error("no drawn pixel keeps the artwork's colour, so the capsule and its shadow replaced it")
	}
	if dark > red {
		t.Errorf("%d near-black pixels against %d carrying the artwork, so the shadow is covering the poster", dark, red)
	}
}

// Rating badges had a border colour and opacity but no width, so the outline
// was always a hairline while genre badges offered Off / Hairline / Custom.
func TestRatingBadgeBorderWidth(t *testing.T) {
	p := effectPipeline()

	render := func(width int) []byte {
		cfg := maximalConfig()
		cfg.RatingBadgeBorderColor = "#00ffff"
		cfg.RatingBadgeBorderWidth = width
		return renderOne(t, p, cfg, "movie", "poster")
	}

	hairline, thick, off := render(0), render(5), render(-1)
	if bytes.Equal(hairline, thick) {
		t.Error("a 5px badge border draws the same as the hairline")
	}
	if bytes.Equal(hairline, off) {
		t.Error("switching the badge border off draws the same as the hairline")
	}

	// Off has to beat the source tint, which otherwise supplies a border for
	// every style that draws none of its own.
	tinted := maximalConfig()
	tinted.RatingBadgeBorderColor = ""
	tinted.RatingBadgeBorderSourceTint = true
	tinted.RatingBadgeBorderWidth = -1
	plain := tinted
	plain.RatingBadgeBorderSourceTint = false
	if !bytes.Equal(renderOne(t, p, tinted, "movie", "poster"), renderOne(t, p, plain, "movie", "poster")) {
		t.Error("the source tint draws a border after the width control switched it off")
	}
}

// v2 filled the shaped plate behind each provider mark with that source's own
// colour, so MAL sat on blue and IMDb on yellow, with the mark on top. v3 filled
// a fixed dark navy and tinted only the edge (FR-135).
func TestIconPlateTakesTheSourceColour(t *testing.T) {
	accent := color.NRGBA{R: 250, G: 50, B: 10, A: 255} // Rotten Tomatoes red
	box := image.Rect(8, 8, 72, 72)

	plateColours := func(filled bool) (source, navy int) {
		dst := image.NewNRGBA(image.Rect(0, 0, 80, 80))
		drawIconPlate(dst, box, "circle", accent, filled)
		for y := box.Min.Y; y < box.Max.Y; y++ {
			for x := box.Min.X; x < box.Max.X; x++ {
				c := dst.NRGBAAt(x, y)
				switch {
				case c.R == accent.R && c.G == accent.G && c.B == accent.B && c.A > 200:
					source++
				case c.R == 15 && c.G == 23 && c.B == 42:
					navy++
				}
			}
		}
		return
	}

	// Unfilled draws the accent on the edge only, so the fill has to grow by far
	// more than a border's worth for this to mean the plate itself changed.
	edgeOnly, navyBefore := plateColours(false)
	body, navyAfter := plateColours(true)
	if navyBefore == 0 {
		t.Fatal("the unfilled plate drew no dark body, so the fixture is wrong")
	}
	if navyAfter != 0 {
		t.Errorf("%d dark pixels remain, so the filled plate kept its navy body", navyAfter)
	}
	if body <= edgeOnly*4 {
		t.Errorf("the filled plate carries %d source-coloured pixels against %d unfilled, which is an edge not a body", body, edgeOnly)
	}
}

// Eight rating marks carry their own brand colours, and a filled plate is
// painted that same accent, so drawing them as-is puts a yellow IMDb mark on a
// yellow plate. On a filled plate they become a silhouette instead (FR-135).
func TestFilledPlateSilhouettesBrandMarks(t *testing.T) {
	for _, tc := range []struct {
		colored, filled, want bool
	}{
		{colored: true, filled: false, want: true},   // untouched: dark plate, brand mark
		{colored: true, filled: true, want: false},   // silhouette, or it vanishes
		{colored: false, filled: false, want: false}, // already a silhouette
		{colored: false, filled: true, want: false},
	} {
		if got := brandColoursSurvive(tc.colored, tc.filled); got != tc.want {
			t.Errorf("brandColoursSurvive(colored=%v, filled=%v) = %v, want %v", tc.colored, tc.filled, got, tc.want)
		}
	}

	// The silhouette has to read against the plate it sits on. IMDb's accent is
	// the worst case: the mark and the plate are the same yellow.
	imdb := color.NRGBA{R: 245, G: 197, B: 24, A: 255}
	ink := contrastingInk(imdb)
	lum := func(c color.NRGBA) int { return (int(c.R)*299 + int(c.G)*587 + int(c.B)*114) / 1000 }
	if diff := lum(imdb) - lum(ink); diff < 80 && diff > -80 {
		t.Errorf("the mark's ink is only %d luminance from the plate, so it will not read", diff)
	}
}

// v2 fitted a constrained row by removing badges; v3 shrank the whole row to a
// 0.2 floor, so a wide short surface ended up unreadable rather than shorter
// (FR-136).
func TestBadgesDropRatherThanShrinkPastLegibility(t *testing.T) {
	six := []provider.Rating{
		{Source: "imdb", Label: "8.4"}, {Source: "tmdb", Label: "7.9"},
		{Source: "rt", Label: "91%"}, {Source: "metacritic", Label: "74"},
		{Source: "letterboxd", Label: "4.1"}, {Source: "trakt", Label: "8.0"},
	}
	ensureFaces() // both production callers do this before measuring
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb", "rt", "metacritic", "letterboxd", "trakt"}

	// A logo surface: wide, short, and the case the report describes.
	const w, h = 640, 120
	shown, scale := fitBadgesToFrame(cfg, w, h, six)

	if len(shown) == len(six) && scale < legibleBadgeScale {
		t.Errorf("kept all %d badges at scale %.2f, below the %.2f legibility floor", len(shown), scale, legibleBadgeScale)
	}
	if len(shown) == 0 {
		t.Fatal("every badge was dropped; the row should never empty")
	}
	if bare := resolveBadgeScale(cfg, w, h, six); scale < bare {
		t.Errorf("trimming left the row smaller (%.2f) than not trimming at all (%.2f)", scale, bare)
	}

	// A frame with room for all six must not drop any.
	if all, _ := fitBadgesToFrame(cfg, 1400, 900, six); len(all) != len(six) {
		t.Errorf("dropped badges on a frame with room for all six: kept %d", len(all))
	}
}

// The strip wraps unless BottomRatingsRow forces one line, so the fit has to be
// measured across those rows. Measured as a single line it drops badges a second
// row would have held; measured properly the wrap absorbs them and the scale is
// what rises instead.
func TestBadgeTrimMeasuresTheWrappedLayout(t *testing.T) {
	ensureFaces()
	six := []provider.Rating{
		{Source: "imdb", Label: "8.4"}, {Source: "tmdb", Label: "7.9"},
		{Source: "rt", Label: "91%"}, {Source: "metacritic", Label: "74"},
		{Source: "letterboxd", Label: "4.1"}, {Source: "trakt", Label: "8.0"},
	}
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb", "rt", "metacritic", "letterboxd", "trakt"}

	// The logo surface from the report: wide, short, and the case where fitting
	// by shrinking alone bottomed out far below readable.
	const w, h = 640, 120
	if raw := resolveBadgeScale(cfg, w, h, six); raw >= legibleBadgeScale {
		t.Fatalf("fixture no longer constrained: raw scale %.2f already clears the floor", raw)
	}
	shown, scale := fitBadgesToFrame(cfg, w, h, six)
	if scale < legibleBadgeScale {
		t.Errorf("strip drawn at %.2f, below the %.2f legibility floor", scale, legibleBadgeScale)
	}
	if len(shown) != len(six) {
		t.Errorf("dropped %d badges the wrap had room for", len(six)-len(shown))
	}
}

func TestStripFitsAtMeasuresRows(t *testing.T) {
	ensureFaces()
	six := []provider.Rating{
		{Source: "imdb", Label: "8.4"}, {Source: "tmdb", Label: "7.9"},
		{Source: "rt", Label: "91%"}, {Source: "metacritic", Label: "74"},
		{Source: "letterboxd", Label: "4.1"}, {Source: "trakt", Label: "8.0"},
	}
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb", "rt", "metacritic", "letterboxd", "trakt"}

	// Narrow enough to force several rows, so the row count is what decides.
	narrow := 260
	rows := stripRowsAt(legibleBadgeScale, six, cfg, narrow)
	if rows < 2 {
		t.Fatalf("fixture no longer wraps: %d row(s) at width %d", rows, narrow)
	}
	if !stripFitsAt(legibleBadgeScale, six, cfg, narrow+40, 900) {
		t.Error("a tall frame with room for every row was reported as not fitting")
	}
	if stripFitsAt(legibleBadgeScale, six, cfg, narrow+40, 30) {
		t.Error("a frame far too short for those rows was reported as fitting")
	}
}
