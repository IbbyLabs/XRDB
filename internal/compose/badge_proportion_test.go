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
			scale := resolveBadgeScale("", cfg, dim.Width, dim.Height, ratings, titleFacts{})
			h := badgeHeightAt(scale, cfg)
			w := widestBadgeAt(scale, ratings, cfg, titleFacts{})

			// The effective cap grows with the configured scale on small surfaces,
			// so a badge must stay within that cap, not the base one.
			capW, capH := badgeShareCaps(cfg, dim.Width, dim.Height)
			if hShare := float64(h) / float64(dim.Height); hShare > capH+0.01 {
				t.Errorf("%s@%d%%: badge %dpx is %.1f%% of the %dpx height, cap is %.0f%%",
					mt, pct, h, hShare*100, dim.Height, capH*100)
			}
			if wShare := float64(w) / float64(dim.Width); wShare > capW+0.01 {
				t.Errorf("%s@%d%%: badge %dpx is %.1f%% of the %dpx width, cap is %.0f%%",
					mt, pct, w, wShare*100, dim.Width, capW*100)
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
		if got := resolveBadgeScale("", proportionConfig(100), dim.Width, dim.Height, ratings, titleFacts{}); got != 1 {
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

// Corner overlays are absolute like the rating strip, so the same cap applies.
func TestOverlayScaleCapsSmallCanvasesOnly(t *testing.T) {
	for _, tc := range []struct {
		mt     string
		capped bool
	}{
		{"poster", false},
		{"backdrop", false},
		{"thumbnail", true},
		{"logo", true},
	} {
		dim := render.DimensionsForSize(tc.mt, "small")
		got := overlayScale(1.0, dim.Height)
		if tc.capped && got >= 1.0 {
			t.Errorf("%s (%dpx tall): scale %v, want it reduced", tc.mt, dim.Height, got)
		}
		if !tc.capped && got != 1.0 {
			t.Errorf("%s (%dpx tall): scale %v, want 1 (unreduced)", tc.mt, dim.Height, got)
		}
		if share := nominalOverlayTileH * got / float64(dim.Height); share > maxBadgeHeightShare+0.001 {
			t.Errorf("%s: tile is %.1f%% of height, cap is %.0f%%", tc.mt, share*100, maxBadgeHeightShare*100)
		}
	}
}

// A 4k render of a backdrop TMDB only has at 1920px is 1.5x the normal frame,
// not 3x. The strip must grow with the picture, and it derives its own scale, so
// asserting on the shared overlay scale leaves this path untested.
func TestTheStripGrowsWithTheFrameNotTheTier(t *testing.T) {
	ensureFaces()
	ensureIcons()
	ratings := proportionRatings()

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb", "rt"}

	big := cfg
	big.Size = imageconfig.Size4K

	if got := resolveBadgeScale("backdrop", big, 1920, 1080, ratings, titleFacts{}); got != 1.5 {
		t.Errorf("scale on a 1920px 4k backdrop = %v, want 1.5 (1920/1280)", got)
	}

	normal := ratingsBandHeight("backdrop", 1280, 720, ratings, cfg, titleFacts{})
	grown := ratingsBandHeight("backdrop", 1920, 1080, ratings, big, titleFacts{})
	if normal == 0 || grown == 0 {
		t.Fatalf("no band drawn: normal=%d grown=%d", normal, grown)
	}
	if ratio := float64(grown) / float64(normal); ratio < 1.4 || ratio > 1.6 {
		t.Errorf("band grew %.2fx (%dpx to %dpx) while the frame grew 1.5x", ratio, normal, grown)
	}
}

// An original that genuinely is 4k keeps the full tier, so the cap only ever
// removes growth the picture did not have.
func TestAGenuine4kOriginalKeepsTheFullTier(t *testing.T) {
	ensureFaces()
	ensureIcons()
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb", "rt"}
	cfg.Size = imageconfig.Size4K

	if got := resolveBadgeScale("backdrop", cfg, 3840, 2160, proportionRatings(), titleFacts{}); got != 3 {
		t.Errorf("scale on a 3840px 4k backdrop = %v, want the full tier 3", got)
	}
}

// A frame delivered at the tier's own dimensions grew by exactly the tier, so
// the cap must not bite. Restating the baseline widths instead of reading the
// dimension table put thumbnails at 780 where they are 320, halving their
// badges at every size above normal.
func TestAFrameAtItsTierDimensionsKeepsTheFullTier(t *testing.T) {
	for _, mt := range []string{"poster", "backdrop", "thumbnail", "logo"} {
		for _, tc := range []struct {
			size imageconfig.MediaSize
			want float64
		}{
			{imageconfig.SizeLarge, 1.5},
			{imageconfig.Size4K, 3},
		} {
			dim := render.DimensionsForSize(mt, string(tc.size))
			if got := frameScale(mt, dim.Width, tc.size); got != tc.want {
				t.Errorf("%s at %s: frame %dpx scored %v, want the full tier %v",
					mt, tc.size, dim.Width, got, tc.want)
			}
		}
	}
}
