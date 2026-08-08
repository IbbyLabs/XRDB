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
	if testing.Short() {
		t.Skip("render sweep: skipped under -short, runs in the ordinary test pass")
	}
	p := effectPipeline()
	styles := imageconfig.BadgeStyles
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
		drawBadgesInPlace(img, ratings, cfg, titleFacts{})

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
		drawBadgesInPlace(img, ratings, cfg, titleFacts{})
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
		drawBadgesInPlace(img, ratings, cfg, titleFacts{})
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
	if testing.Short() {
		t.Skip("render sweep: skipped under -short, runs in the ordinary test pass")
	}
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
	if testing.Short() {
		t.Skip("render sweep: skipped under -short, runs in the ordinary test pass")
	}
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
		// Opaque, as a poster is: a translucent plate composites over the
		// artwork, so its colour is only well defined against one.
		dst := image.NewNRGBA(image.Rect(0, 0, 80, 80))
		for y := 0; y < 80; y++ {
			for x := 0; x < 80; x++ {
				dst.SetNRGBA(x, y, color.NRGBA{A: 255})
			}
		}
		drawIconPlate(dst, box, "circle", accent, filled, color.NRGBA{R: accent.R, G: accent.G, B: accent.B, A: 235})
		// A translucent plate composites, so it lands near its colour rather than
		// exactly on it. Classify by which of the two it is closer to.
		near := func(c, want color.NRGBA) bool {
			d := func(a, b uint8) int {
				if a > b {
					return int(a) - int(b)
				}
				return int(b) - int(a)
			}
			return d(c.R, want.R) <= 24 && d(c.G, want.G) <= 24 && d(c.B, want.B) <= 24
		}
		for y := box.Min.Y; y < box.Max.Y; y++ {
			for x := box.Min.X; x < box.Max.X; x++ {
				c := dst.NRGBAAt(x, y)
				switch {
				case near(c, accent) && c.A > 200:
					source++
				case near(c, color.NRGBA{R: 15, G: 23, B: 42}):
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
func TestATintedSilhouetteReadsAgainstItsPlate(t *testing.T) {
	// A greyscale mark is tinted to a silhouette on a filled plate and must read
	// against it. IMDb's accent is the worst case: the mark and the plate are
	// the same yellow. (A brand-coloured mark keeps its colours instead — see
	// TestABrandMarkKeepsItsColoursOnAFilledPlate.)
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
	shown, scale := fitBadgesToFrame(cfg, w, h, six, titleFacts{})

	if len(shown) == len(six) && scale < legibleBadgeScale {
		t.Errorf("kept all %d badges at scale %.2f, below the %.2f legibility floor", len(shown), scale, legibleBadgeScale)
	}
	if len(shown) == 0 {
		t.Fatal("every badge was dropped; the row should never empty")
	}
	if bare := resolveBadgeScale(cfg, w, h, six, titleFacts{}); scale < bare {
		t.Errorf("trimming left the row smaller (%.2f) than not trimming at all (%.2f)", scale, bare)
	}

	// A frame with room for all six must not drop any.
	if all, _ := fitBadgesToFrame(cfg, 1400, 900, six, titleFacts{}); len(all) != len(six) {
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
	if raw := resolveBadgeScale(cfg, w, h, six, titleFacts{}); raw >= legibleBadgeScale {
		t.Fatalf("fixture no longer constrained: raw scale %.2f already clears the floor", raw)
	}
	shown, scale := fitBadgesToFrame(cfg, w, h, six, titleFacts{})
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
	rows := stripRowsAt(legibleBadgeScale, six, cfg, narrow, titleFacts{})
	if rows < 2 {
		t.Fatalf("fixture no longer wraps: %d row(s) at width %d", rows, narrow)
	}
	if !stripFitsAt(legibleBadgeScale, six, cfg, narrow+40, 900, titleFacts{}) {
		t.Error("a tall frame with room for every row was reported as not fitting")
	}
	if stripFitsAt(legibleBadgeScale, six, cfg, narrow+40, 30, titleFacts{}) {
		t.Error("a frame far too short for those rows was reported as fitting")
	}
}

// The fit check runs before the manual offset is applied, so a label approved at
// the corner was then nudged past the edge with nothing rechecking it (BUG-187).
func TestGenreFitAccountsForTheManualOffset(t *testing.T) {
	const w = 420

	// Ink is the test, not position: a badge held flush against the edge is fine,
	// a badge with pixels cut off it is not. One short genre on a wide frame so
	// the auto-trim never fires — trimming also lowers the ink count, and that is
	// intended, so it would mask the clipping this is looking for.
	ink := func(genres []string, offsetX int) int {
		img := image.NewNRGBA(image.Rect(0, 0, w, 600))
		drawGenreBadge(img, genres, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode:    "text",
			offsetX: offsetX,
		})
		n := 0
		for i := 3; i < len(img.Pix); i += 4 {
			if img.Pix[i] > 0 {
				n++
			}
		}
		return n
	}

	short := []string{"Horror"}
	base := ink(short, 0)
	if base == 0 {
		t.Fatal("the fixture drew nothing")
	}
	for _, offset := range []int{60, 150, 320, -60, -150} {
		if got := ink(short, offset); got != base {
			t.Errorf("offset %d drew %d pixels against %d un-nudged, so part of the label was cut off", offset, got, base)
		}
	}

	// A nudge toward the far edge is answered by trimming rather than clamping,
	// so a long list nudged right still fits without losing a partial glyph.
	long := []string{"Action & Adventure", "Animation", "Science Fiction"}
	if ink(long, 120) == 0 {
		t.Error("a nudged long list drew nothing at all")
	}
}

// The configurator's default genre mode is the empty string. The fit check tests
// for "text" by name, so the default skipped it and only the clean and tile
// styles, which rewrite the mode, trimmed a list that ran off (BUG-187).
func TestGenreFitRunsOnTheDefaultMode(t *testing.T) {
	genres := []string{"Action", "Fantasy", "Science Fiction"}

	right := func(mode, style string) int {
		img := image.NewNRGBA(image.Rect(0, 0, 300, 450))
		drawGenreBadge(img, genres, "tl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode: mode, style: style,
		})
		for x := img.Bounds().Max.X - 1; x >= 0; x-- {
			for y := 0; y < img.Bounds().Max.Y; y++ {
				if img.NRGBAAt(x, y).A > 0 {
					return x
				}
			}
		}
		return -1
	}

	for _, style := range []string{"plain", "glass", "square", "clean", "tile"} {
		got := right("", style)
		if got < 0 {
			t.Fatalf("%s drew nothing", style)
		}
		if got >= 299 {
			t.Errorf("%s reached x=%d, so the label ran to the frame edge untrimmed", style, got)
		}
		if want := right("text", style); got != want {
			t.Errorf("%s: the default mode ended at x=%d and text at x=%d, so they trim differently", style, got, want)
		}
	}
}

// The label control names what the plate says. The glyph modes used to overwrite
// it with the family name, so choosing "Genre list" alongside a glyph gave
// "SCI FI" rather than the list the control named (FR-142).
func TestGenreLabelControlDecidesWhatThePlateSays(t *testing.T) {
	genres := []string{"Science Fiction", "Action"}

	draw := func(mode, labelMode string) []byte {
		img := image.NewNRGBA(image.Rect(0, 0, 500, 600))
		drawGenreBadge(img, genres, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode: mode, labelMode: labelMode,
		})
		return img.Pix
	}

	// With a glyph, the list and the family name must differ — one is
	// "Science Fiction · Action", the other "SCI FI".
	if bytes.Equal(draw("both", ""), draw("both", "family")) {
		t.Error("the genre list and the family name draw identically with a glyph, so the label control is ignored")
	}
	// And the list must read the same whether a glyph sits beside it or not.
	// Widths differ, so compare the label rather than the whole frame.
	listOnly := draw("text", "")
	if bytes.Equal(listOnly, draw("text", "family")) {
		t.Error("the family name is not reachable in text mode")
	}
	// Family name still available, which is what the glyph modes used to force.
	if bytes.Equal(draw("both", "family"), draw("both", "primary")) {
		t.Error("family name and first-only draw identically")
	}
}

// The fit check was gated on text mode, which was right while only text mode
// showed the genre list. Once the label control could put the list beside a
// glyph, Both mode overflowed with nothing trimming it.
func TestGenreFitRunsWhereverTheListIsShown(t *testing.T) {
	long := []string{"Action & Adventure", "Science Fiction", "War & Politics"}
	const w = 420

	edge := func(mode string) (lo, hi int) {
		img := image.NewNRGBA(image.Rect(0, 0, w, 600))
		drawGenreBadge(img, long, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode: mode,
		})
		lo, hi = -1, -1
		for x := 0; x < w; x++ {
			for y := img.Bounds().Min.Y; y < img.Bounds().Max.Y; y++ {
				if img.NRGBAAt(x, y).A > 0 {
					if lo < 0 {
						lo = x
					}
					hi = x
					break
				}
			}
		}
		return
	}

	for _, mode := range []string{"text", "both"} {
		lo, hi := edge(mode)
		if lo < 0 {
			t.Fatalf("%s mode drew nothing", mode)
		}
		if lo == 0 || hi == w-1 {
			t.Errorf("%s mode spans x=%d..%d on a %dpx poster, so the list is clipped at the edge", mode, lo, hi, w)
		}
	}
}

// Picking one genre and shouting it were the same switch, so a first-only label
// could not be had without the capitals. Case is now its own control, and an
// unset value keeps what each label mode did on its own (FR-141).
func TestGenreCaseIsSeparateFromTheLabelChoice(t *testing.T) {
	genres := []string{"Horror", "Comedy", "Thriller"}

	draw := func(labelMode, labelCase string) []byte {
		img := image.NewNRGBA(image.Rect(0, 0, 500, 600))
		drawGenreBadge(img, genres, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode: "text", labelMode: labelMode, labelCase: labelCase,
		})
		return img.Pix
	}

	// Unset keeps today's behaviour on both label modes.
	if !bytes.Equal(draw("primary", ""), draw("primary", "upper")) {
		t.Error("first-only stopped capitalising by default")
	}
	if !bytes.Equal(draw("", ""), draw("", "normal")) {
		t.Error("the genre list stopped using the source's spelling by default")
	}
	// And each case is reachable from the other label mode, which is the point.
	if bytes.Equal(draw("primary", ""), draw("primary", "normal")) {
		t.Error("first-only cannot be had without the capitals")
	}
	if bytes.Equal(draw("", ""), draw("", "upper")) {
		t.Error("the genre list cannot be capitalised")
	}
}

// A fixed count is an editorial choice, not a fitting one: "Horror · Comedy"
// against "Horror · Thriller" is about which genre carries the meaning (FR-141).
func TestGenreCountDialCapsTheList(t *testing.T) {
	genres := []string{"Horror", "Comedy", "Thriller"}

	widthOf := func(maxGenres int) int {
		img := image.NewNRGBA(image.Rect(0, 0, 900, 600))
		drawGenreBadge(img, genres, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode: "text", maxGenres: maxGenres,
		})
		lo, hi := -1, -1
		for x := 0; x < 900; x++ {
			for y := img.Bounds().Min.Y; y < img.Bounds().Max.Y; y++ {
				if img.NRGBAAt(x, y).A > 0 {
					if lo < 0 {
						lo = x
					}
					hi = x
					break
				}
			}
		}
		return hi - lo
	}

	auto, one, two := widthOf(0), widthOf(1), widthOf(2)
	if one >= two || two >= auto {
		t.Errorf("the count dial does not narrow the plate in order: one=%d two=%d auto=%d", one, two, auto)
	}
}

// The fit check rebuilds the label from the trimmed list, which dropped the
// casing the Case control had applied — so capitals survived only while nothing
// needed trimming (FR-141).
func TestGenreCaseSurvivesTheFitTrim(t *testing.T) {
	// Long enough that the fit check has to drop a genre on this frame.
	long := []string{"Action & Adventure", "Science Fiction", "War & Politics"}

	draw := func(labelCase string) []byte {
		img := image.NewNRGBA(image.Rect(0, 0, 380, 600))
		drawGenreBadge(img, long, "bl", 1, newOccupancy(img.Bounds()), genreBadgeOpts{
			mode: "text", labelCase: labelCase,
		})
		return img.Pix
	}

	if bytes.Equal(draw("upper"), draw("normal")) {
		t.Error("capitals and as-written draw identically once the list is trimmed, so the case was lost")
	}
}

// Shorthand renames only where the shorter form resolves to the same family, so
// the word on the plate cannot disagree with the glyph beside it (FR-142).
func TestShortGenreNamesAgreeWithTheGlyph(t *testing.T) {
	for _, tc := range []struct{ long, short string }{
		{"Action & Adventure", "Action"},
		{"Sci-Fi & Fantasy", "Sci-Fi"},
		{"Science Fiction", "Sci-Fi"},
	} {
		got := shortenGenres([]string{tc.long})
		if len(got) != 1 || got[0] != tc.short {
			t.Errorf("shortenGenres(%q) = %v, want %q", tc.long, got, tc.short)
		}
		// The whole rule: a renamed genre must land on the same family, or the
		// label and the mark say different things about one title.
		before := resolveGenreFamily([]string{tc.long})
		after := resolveGenreFamily([]string{tc.short})
		if before == nil || after == nil || before.id != after.id {
			t.Errorf("%q resolves to %v but %q resolves to %v", tc.long, before, tc.short, after)
		}
	}

	// War is left long on purpose: its two TMDB genres resolve to different
	// families, so one shortened word would appear on two different marks.
	if got := shortenGenres([]string{"War & Politics"}); got[0] != "War & Politics" {
		t.Errorf("War & Politics was shortened to %q, which collides with the movie genre War", got[0])
	}
	if a, b := resolveGenreFamily([]string{"War"}), resolveGenreFamily([]string{"War & Politics"}); a.id == b.id {
		t.Skip("War and War & Politics now share a family; shortening it would be safe")
	}

	// Everything short enough is left exactly as the source spells it.
	for _, keep := range []string{"Horror", "Drama", "Documentary", "TV Movie", "Reality"} {
		if got := shortenGenres([]string{keep}); got[0] != keep {
			t.Errorf("%q was rewritten to %q", keep, got[0])
		}
	}
}

// The pill presentations draw one capsule instead of the per-source badges, so
// the badge outline group has to reach that capsule too. BUG-183 fixed the
// opacity control for exactly this shape and the border group beside it was left
// behind, which is BUG-210.
func TestBadgeOutlineReachesTheScorePills(t *testing.T) {
	if testing.Short() {
		t.Skip("render sweep: skipped under -short, runs in the ordinary test pass")
	}
	p := effectPipeline()
	controls := []struct {
		name string
		set  func(*imageconfig.Config)
	}{
		{"colour", func(c *imageconfig.Config) { c.RatingBadgeBorderColor = "#ff0000" }},
		{"width", func(c *imageconfig.Config) { c.RatingBadgeBorderWidth = 3 }},
		{"opacity", func(c *imageconfig.Config) {
			c.RatingBadgeBorderColor = "#ff0000"
			c.RatingBadgeBorderOpacity = 20
		}},
		{"source tint", func(c *imageconfig.Config) { c.RatingBadgeBorderSourceTint = true }},
	}
	for _, presentation := range []string{"minimal", "average", "dual", "dual-minimal"} {
		for _, control := range controls {
			t.Run(presentation+"/"+control.name, func(t *testing.T) {
				off := maximalConfig()
				off.RatingPresentation = presentation
				on := off
				control.set(&on)

				if bytes.Equal(renderOne(t, p, off, "movie", "poster"), renderOne(t, p, on, "movie", "poster")) {
					t.Errorf("badge outline %s changes nothing on the %s presentation", control.name, presentation)
				}
			})
		}
	}
}

// By-score accents draw the capsule outline on a label-less pill, so an outline
// colour typed into the config takes that slot. The score colour has to survive
// the move rather than the ring going static: it keeps the pill by moving to the
// strip. Two scores far apart under the same stops must still render differently.
func TestScorePillKeepsItsScoreColourWhenAnOutlineTakesTheCapsule(t *testing.T) {
	stops := "40:#f97316,60:#f97316,90:#3b82f6,100:#3b82f6"
	draw := func(score float64, border string) *image.NRGBA {
		cfg := imageconfig.Default()
		cfg.AggregateAccentMode = "dynamic"
		cfg.AggregateDynamicStops = stops
		cfg.RatingBadgeBorderColor = border

		img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
		style := aggregatePillStyle(cfg, "overall", nil, false, score, color.NRGBA{R: 80, G: 80, B: 90, A: 255})
		drawAggregatePills(img, cfg, 1, newOccupancy(img.Bounds()), false, aggregatePill{
			score: formatRatingValue(score, cfg.RatingValueMode), style: style,
		})
		return img
	}

	// Comparing whole renders would pass on the score text alone, since "6.2"
	// and "9.1" draw different glyphs whatever the accent does. Count the stop
	// colours instead, which is the thing that has to survive.
	orange := color.NRGBA{R: 249, G: 115, B: 22, A: 255} // the 6.2 stop
	blue := color.NRGBA{R: 59, G: 130, B: 246, A: 255}   // the 9.1 stop
	red := color.NRGBA{R: 255, G: 0, B: 0, A: 255}       // the typed outline

	// Without an outline colour the accent owns the capsule: the By-score ring.
	if n := countNear(draw(6.2, ""), orange); n == 0 {
		t.Error("no pixel carries the 6.2 stop colour, so the by-score ring is not drawn")
	}
	if n := countNear(draw(9.1, ""), blue); n == 0 {
		t.Error("no pixel carries the 9.1 stop colour, so the ring stopped following the score")
	}
	// With one, the typed colour takes the capsule and the accent moves to the
	// strip. Both have to be on the pill; losing either is the failure.
	low, high := draw(6.2, "#ff0000"), draw(9.1, "#ff0000")
	if n := countNear(low, red); n == 0 {
		t.Error("the typed outline colour is absent, so the border still does not reach the pill")
	}
	if n := countNear(low, orange); n == 0 {
		t.Error("the 6.2 stop colour vanished once an outline was set, so the score colour was dropped rather than moved to the strip")
	}
	if n := countNear(high, blue); n == 0 {
		t.Error("the 9.1 stop colour vanished once an outline was set, so the score colour was dropped rather than moved to the strip")
	}
}

// Picking an accent mode and leaving its colour unset left every control in the
// Score colours panel inert: accent, fill, body tint and shape are all gated on
// a hex that never resolved. The scorebar presentation already falls back to the
// score bands here, so the pills were the odd one out (BUG-211).
func TestChosenAccentModeAlwaysColoursTheScorePills(t *testing.T) {
	if testing.Short() {
		t.Skip("render sweep: skipped under -short, runs in the ordinary test pass")
	}
	p := effectPipeline()
	modes := []struct {
		name string
		set  func(*imageconfig.Config)
	}{
		{"custom with no colour", func(c *imageconfig.Config) { c.AggregateAccentMode = "custom" }},
		{"custom with fill by score", func(c *imageconfig.Config) {
			c.AggregateAccentMode = "custom"
			c.AggregateFillByScore = true
		}},
		{"dynamic with no stops", func(c *imageconfig.Config) { c.AggregateAccentMode = "dynamic" }},
		{"source", func(c *imageconfig.Config) { c.AggregateAccentMode = "source" }},
	}
	for _, presentation := range []string{"minimal", "average", "dual", "dual-minimal"} {
		for _, mode := range modes {
			t.Run(presentation+"/"+mode.name, func(t *testing.T) {
				off := maximalConfig()
				off.RatingPresentation = presentation
				on := off
				mode.set(&on)

				if bytes.Equal(renderOne(t, p, off, "movie", "poster"), renderOne(t, p, on, "movie", "poster")) {
					t.Errorf("accent mode %q changes nothing on the %s presentation", mode.name, presentation)
				}
			})
		}
	}
}

// The fallback belongs to a mode the user picked. Choosing none has to keep the
// plain capsule, or every pill gains a coloured ring nobody asked for.
func TestNoAccentModeLeavesTheScorePillPlain(t *testing.T) {
	draw := func(mode string) *image.NRGBA {
		cfg := imageconfig.Default()
		cfg.AggregateAccentMode = mode
		img := image.NewNRGBA(image.Rect(0, 0, 500, 750))
		style := aggregatePillStyle(cfg, "overall", nil, false, 8.4, color.NRGBA{R: 80, G: 80, B: 90, A: 255})
		drawAggregatePills(img, cfg, 1, newOccupancy(img.Bounds()), false, aggregatePill{
			score: "8.4", style: style,
		})
		return img
	}
	green := color.NRGBA{R: 39, G: 174, B: 96, A: 255} // the high score band
	if n := countNear(draw(""), green); n > 0 {
		t.Errorf("%d pixels carry the score band with no accent mode chosen, so the capsule stopped being plain", n)
	}
	if n := countNear(draw("custom"), green); n == 0 {
		t.Error("choosing custom with no colour draws no score band, so the panel is still inert")
	}
}

// The pills and the scorebar resolve their accent through one function, so a
// mode cannot be live on one and dead on the other. Pin what each mode returns:
// the render-level tests above do not reach every branch, and a wrong colour
// here is invisible to them.
func TestAggregateAccentHexPerMode(t *testing.T) {
	base := imageconfig.Default()
	base.AggregateAccentColor = "#123456"
	base.AggregateCriticsAccentColor = "#aa0000"
	base.AggregateAudienceAccentColor = "#0000aa"
	base.AggregateDynamicStops = "40:#f97316,90:#3b82f6"

	tests := []struct {
		mode, role, want string
	}{
		{"", "overall", "#123456"},        // a bare colour behaves as custom
		{"custom", "overall", "#123456"},  //
		{"custom", "critics", "#aa0000"},  // per-role colour wins
		{"custom", "audience", "#0000aa"}, //
		{"source", "critics", "#22c55e"},
		{"source", "audience", "#38bdf8"},
		{"source", "overall", "#f59e0b"},
		{"genre", "overall", ""}, // no genres given, so nothing resolves
	}
	for _, tc := range tests {
		t.Run(tc.mode+"/"+tc.role, func(t *testing.T) {
			cfg := base
			cfg.AggregateAccentMode = tc.mode
			if got := aggregateAccentHex(cfg, tc.role, nil, false, 8.4); got != tc.want {
				t.Errorf("accent mode %q for %q resolved %q, want %q", tc.mode, tc.role, got, tc.want)
			}
		})
	}

	// Dynamic reads the ramp, and resolves nothing without one so the caller
	// falls back to the score bands.
	cfg := base
	cfg.AggregateAccentMode = "dynamic"
	if got := aggregateAccentHex(cfg, "overall", nil, false, 9.5); got != "#3b82f6" {
		t.Errorf("dynamic at 9.5 resolved %q, want the top stop", got)
	}
	cfg.AggregateDynamicStops = ""
	if got := aggregateAccentHex(cfg, "overall", nil, false, 9.5); got != "" {
		t.Errorf("dynamic with no ramp resolved %q, want nothing so the bands take over", got)
	}
}
