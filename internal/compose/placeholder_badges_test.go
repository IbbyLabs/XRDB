package compose

import (
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func drawsSomething(draw func(*image.NRGBA, *occupancy)) bool {
	base := image.NewNRGBA(image.Rect(0, 0, 400, 300))
	bg := color.NRGBA{R: 90, G: 120, B: 150, A: 255}
	for y := range 300 {
		for x := range 400 {
			base.SetNRGBA(x, y, bg)
		}
	}
	draw(base, newOccupancy(base.Bounds()))
	for y := range 300 {
		for x := range 400 {
			if base.NRGBAAt(x, y) != bg {
				return true
			}
		}
	}
	return false
}

// A grid where one poster has badges and the one beside it has none reads as
// ragged. Each placeholder is off by default, so no poster gains a badge it has
// never drawn (FR-204).
func TestEachPlaceholderIsOffByDefault(t *testing.T) {
	cfg := imageconfig.Default()
	if cfg.GenrePlaceholder || cfg.AgeRatingPlaceholder || cfg.RatingRingPlaceholder {
		t.Fatal("a placeholder defaults on; every poster with nothing to show would gain a badge")
	}

	for _, tc := range []struct {
		name string
		draw func(*image.NRGBA, *occupancy)
	}{
		{"genre", func(b *image.NRGBA, occ *occupancy) {
			drawGenreBadge(b, nil, "tl", 2, occ, genreOptsFromConfig(cfg, false, "movie"))
		}},
		{"age", func(b *image.NRGBA, occ *occupancy) {
			drawAgeRatingBadge(b, "", "tl", 2, occ, ageOptsFromConfig(cfg))
		}},
	} {
		if drawsSomething(tc.draw) {
			t.Errorf("the %s badge drew a placeholder with the setting off", tc.name)
		}
	}
}

// The media type rather than the "other" family: that family means the genres
// were not recognised, which is a different statement from there being none.
func TestTheGenrePlaceholderIsTheMediaType(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.GenrePlaceholder = true

	for _, tc := range []struct {
		isAnime bool
		kind    string
		want    string
	}{
		{true, "series", "ANIME"},
		{false, "series", "SHOW"},
		{false, "movie", "MOVIE"},
		{false, "", "MOVIE"},
	} {
		if got := genrePlaceholderFor(cfg, tc.isAnime, tc.kind); got != tc.want {
			t.Errorf("anime=%v kind=%q gave %q, want %q", tc.isAnime, tc.kind, got, tc.want)
		}
	}
	// The control: with the setting off there is no placeholder at all, so the
	// media type is not simply always returned.
	cfg.GenrePlaceholder = false
	if got := genrePlaceholderFor(cfg, true, "series"); got != "" {
		t.Errorf("placeholder with the setting off = %q", got)
	}
}

// A free-text certificate would be drawn as though a source had supplied it.
func TestTheAgePlaceholderIsFixed(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.AgeRatingPlaceholder = true
	if got := agePlaceholderFor(cfg); got != "NR" {
		t.Errorf("age placeholder = %q, want NR", got)
	}
	cfg.AgeRatingPlaceholder = false
	if got := agePlaceholderFor(cfg); got != "" {
		t.Errorf("placeholder with the setting off = %q", got)
	}
}

// The empty ring is the outline with no arc and no number, so it reads as
// nothing to show rather than as a score of zero.
func TestTheEmptyRingDrawsWithoutAValue(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingRing = true
	cfg.Ratings = []string{"imdb"}

	off := drawsSomething(func(b *image.NRGBA, occ *occupancy) {
		drawAverageRatingRing(b, nil, cfg, 2, occ)
	})
	if off {
		t.Error("a ring drew with no ratings and the placeholder off")
	}

	cfg.RatingRingPlaceholder = true
	on := drawsSomething(func(b *image.NRGBA, occ *occupancy) {
		drawAverageRatingRing(b, nil, cfg, 2, occ)
	})
	if !on {
		t.Error("the empty ring drew nothing with the placeholder on")
	}

	// The control: a ring with real ratings still draws, so the placeholder has
	// not replaced the ordinary path.
	withRatings := drawsSomething(func(b *image.NRGBA, occ *occupancy) {
		drawAverageRatingRing(b, []provider.Rating{{Source: "imdb", Value: 8.4}}, cfg, 2, occ)
	})
	if !withRatings {
		t.Error("a ring with ratings drew nothing")
	}
}
