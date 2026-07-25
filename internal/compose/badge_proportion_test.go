package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

func proportionRatings() []provider.Rating {
	return []provider.Rating{
		{Source: "imdb", Value: 8.3},
		{Source: "tmdb", Value: 8.2},
		{Source: "rt", Value: 9.4},
	}
}

func proportionConfig(pct int) imageconfig.Config {
	cfg := imageconfig.Config{
		Size:          imageconfig.SizeSmall,
		Ratings:       []string{"imdb", "tmdb", "rt"},
		RatingsLayout: imageconfig.LayoutTop,
	}
	cfg.RatingBadgeScale = pct
	return cfg
}

// A badge sized for a 1170px poster covers a third of a 180px thumbnail, so the
// scale is capped against the frame rather than the configured size alone.
func TestBadgesStayProportionalOnEveryMediaType(t *testing.T) {
	ensureFaces()
	ensureIcons()
	ratings := proportionRatings()

	for _, mt := range []string{"poster", "backdrop", "thumbnail", "logo"} {
		for _, pct := range []int{100, 400} {
			dim := render.DimensionsForSize(mt, "small")
			cfg := proportionConfig(pct)
			scale := resolveBadgeScale(cfg, dim.Width, dim.Height, ratings)
			h := badgeHeightAt(scale, cfg)
			w := widestBadgeAt(scale, ratings, cfg)

			if hShare := float64(h) / float64(dim.Height); hShare > maxBadgeHeightShare+0.01 {
				t.Errorf("%s@%d%%: badge %dpx is %.1f%% of the %dpx height, cap is %.0f%%",
					mt, pct, h, hShare*100, dim.Height, maxBadgeHeightShare*100)
			}
			if wShare := float64(w) / float64(dim.Width); wShare > maxBadgeWidthShare+0.01 {
				t.Errorf("%s@%d%%: badge %dpx is %.1f%% of the %dpx width, cap is %.0f%%",
					mt, pct, w, wShare*100, dim.Width, maxBadgeWidthShare*100)
			}
		}
	}
}

// The caps exist for small canvases; poster and backdrop sit inside them, so
// asking for 100% must still give the full unreduced scale there.
func TestPosterAndBackdropKeepTheirScale(t *testing.T) {
	ensureFaces()
	ensureIcons()
	ratings := proportionRatings()

	for _, mt := range []string{"poster", "backdrop"} {
		dim := render.DimensionsForSize(mt, "small")
		if got := resolveBadgeScale(proportionConfig(100), dim.Width, dim.Height, ratings); got != 1 {
			t.Errorf("%s scale = %v, want 1 (unreduced)", mt, got)
		}
	}
}

// Centre-anchored quality badges are a row along the edge. Placing each tile
// separately centres them all on one x, which stacks them into a column.
func TestCentreQualityBadgesShareARow(t *testing.T) {
	for _, pos := range []string{"bc", "tc"} {
		dim := render.DimensionsForSize("poster", "small")
		base := image.NewNRGBA(image.Rect(0, 0, dim.Width, dim.Height))
		occ := newOccupancy(base.Bounds())

		if n := drawQualityBadges(base, []string{"dv", "atmos"}, 1.0, occ, qualityBadgeOpts{pos: pos}); n != 2 {
			t.Fatalf("%s: drew %d badges, want 2", pos, n)
		}
		if len(occ.rects) != 1 {
			t.Fatalf("%s: reserved %d boxes, want 1 row", pos, len(occ.rects))
		}
		row := occ.rects[0]

		edge := dim.Height - row.Max.Y
		if pos == "tc" {
			edge = row.Min.Y
		}
		if edge > dim.Height/10 {
			t.Errorf("%s: row is %dpx from its edge, want it anchored there", pos, edge)
		}
		if centre := dim.Width / 2; absInt(row.Min.X+row.Dx()/2-centre) > 2 {
			t.Errorf("%s: row centre x=%d, want %d", pos, row.Min.X+row.Dx()/2, centre)
		}
	}
}

// More badges than fit on one row wrap to a second rather than overflowing.
func TestCentreQualityBadgesWrapWhenTheRowIsFull(t *testing.T) {
	base := image.NewNRGBA(image.Rect(0, 0, 260, 400))
	occ := newOccupancy(base.Bounds())

	tokens := []string{"dv", "atmos", "imax", "dts"}
	if n := drawQualityBadges(base, tokens, 1.0, occ, qualityBadgeOpts{pos: "bc"}); n != len(tokens) {
		t.Fatalf("drew %d badges, want %d", n, len(tokens))
	}
	if len(occ.rects) < 2 {
		t.Fatalf("reserved %d rows, want the badges wrapped onto more than one", len(occ.rects))
	}
	for i, r := range occ.rects {
		if r.Min.X < 0 || r.Max.X > 260 {
			t.Errorf("row %d spans x=%d..%d, outside the 260px frame", i, r.Min.X, r.Max.X)
		}
	}
}

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
