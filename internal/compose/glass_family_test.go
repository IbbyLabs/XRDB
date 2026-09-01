package compose

import (
	"image"
	"image/color"
	"testing"
)

// glassPlate draws one badge in the glass style over a flat background and
// returns the colour its body settles on: the most common colour that is not
// the background. Sampling a fixed point instead reads whichever of the border,
// the shadow or the text happens to sit there, and the three badges are
// different sizes.
func glassPlate(t *testing.T, draw func(*image.NRGBA, *occupancy)) color.NRGBA {
	t.Helper()
	bg := color.NRGBA{R: 120, G: 160, B: 200, A: 255}
	base := image.NewNRGBA(image.Rect(0, 0, 640, 200))
	for py := range 200 {
		for px := range 640 {
			base.SetNRGBA(px, py, bg)
		}
	}
	draw(base, newOccupancy(base.Bounds()))

	counts := map[color.NRGBA]int{}
	for py := range 200 {
		for px := range 640 {
			if c := base.NRGBAAt(px, py); c != bg {
				counts[c]++
			}
		}
	}
	var best color.NRGBA
	most := 0
	for c, n := range counts {
		if n > most {
			best, most = c, n
		}
	}
	if most == 0 {
		t.Fatal("the badge drew nothing, so this compares the background with itself")
	}
	return best
}

// The age, genre and quality badges each implement glass separately, and a
// viewer sees one poster. They are not pixel-identical — two of them draw
// through drawSoftTile and one through blendRoundedRect — so this holds them to
// the same family rather than to a number, and a value change that keeps them
// together stays green.
func TestTheThreeGlassBadgesReadAsOneFamily(t *testing.T) {
	age := glassPlate(t, func(b *image.NRGBA, occ *occupancy) {
		drawAgeRatingBadge(b, "AGE", "tl", 2, occ, ageRatingOpts{style: "glass"})
	})
	genre := glassPlate(t, func(b *image.NRGBA, occ *occupancy) {
		drawGenreBadge(b, []string{"GEN"}, "tl", 2, occ, genreBadgeOpts{style: "glass"})
	})
	quality := glassPlate(t, func(b *image.NRGBA, occ *occupancy) {
		drawQualityBadges(b, []string{"4K"}, 2, occ, qualityBadgeOpts{pos: "tl", style: "glass"})
	})

	const tolerance = 25
	for _, pair := range []struct {
		a, b string
		x, y color.NRGBA
	}{{"age", "genre", age, genre}, {"age", "quality", age, quality}, {"genre", "quality", genre, quality}} {
		for _, ch := range []struct {
			name string
			l, r uint8
		}{{"R", pair.x.R, pair.y.R}, {"G", pair.x.G, pair.y.G}, {"B", pair.x.B, pair.y.B}} {
			d := int(ch.l) - int(ch.r)
			if d < 0 {
				d = -d
			}
			if d > tolerance {
				t.Errorf("%s and %s differ by %d on %s (%d vs %d); glass has drifted apart",
					pair.a, pair.b, d, ch.name, ch.l, ch.r)
			}
		}
	}
	t.Logf("body  age %v genre %v quality %v", age, genre, quality)
}
