package compose

import (
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"strconv"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
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
	face := valueFaceFor(scale * ringValueFontScale)
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

// TestBottomBandPlacement drives the full bottom-band overlay stack the way
// Render does (ratings strip, quality badges, age badge, genre pill, provider
// chips, trending tag) and asserts no two reserved regions overlap. It also
// asserts storefront duplicates collapse to one chip per brand. When BAND_OUT
// names a path it writes a poster-sized PNG for eyeballing:
//
//	BAND_OUT=/path/poster.png go test ./internal/compose -run TestBottomBandPlacement
func TestBottomBandPlacement(t *testing.T) {
	const scale = 1.0
	card := image.NewNRGBA(image.Rect(0, 0, 780, 1170))
	paintBackdropGradient(card)

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"tmdb", "imdb"}
	cfg.BadgeStyle = imageconfig.BadgeSquare
	ratings := []provider.Rating{
		{Source: "tmdb", Label: "8.5"},
		{Source: "imdb", Label: "7.8"},
	}

	occ := newOccupancy(card.Bounds())
	ratingsH := drawBadgesInPlace(card, ratings, cfg)
	if ratingsH > 0 {
		b := card.Bounds()
		const band = 20 * scale
		occ.reserve(image.Rect(b.Min.X, b.Max.Y-ratingsH-band, b.Max.X, b.Max.Y))
	}
	drawQualityBadges(card, []string{"imax", "atmos", "dv", "4k"}, scale, occ)
	drawAgeRatingBadge(card, "TV-MA", "br", scale, occ)
	drawGenreBadge(card, []string{"Mystery", "Drama", "Sci-Fi"}, "bl", scale, occ, genreBadgeOpts{})
	providers := []provider.WatchProvider{
		{ID: 1, Name: "fuboTV"},
		{ID: 2, Name: "MGM Plus"},
		{ID: 3, Name: "MGM Plus Amazon Channel"},
		{ID: 4, Name: "MGM+ Roku Premium Channel"},
		{ID: 5, Name: "Philo"},
	}
	if got := len(dedupeProviders(providers)); got != 3 {
		t.Errorf("dedupeProviders kept %d entries, want 3 (fuboTV, MGM+, Philo)", got)
	}
	drawProviderBadges(card, providers, scale, occ)
	drawTrendingBadgeStyled(card, scale, occ, trendingArrowWord)

	for i := 0; i < len(occ.rects); i++ {
		for j := i + 1; j < len(occ.rects); j++ {
			if occ.rects[i].Overlaps(occ.rects[j]) {
				t.Errorf("reserved regions overlap: %v vs %v", occ.rects[i], occ.rects[j])
			}
		}
	}

	out := os.Getenv("BAND_OUT")
	if out == "" {
		return
	}
	f, err := os.Create(out)
	if err != nil {
		t.Fatalf("create %s: %v", out, err)
	}
	defer f.Close()
	if err := png.Encode(f, card); err != nil {
		t.Fatalf("encode: %v", err)
	}
}
