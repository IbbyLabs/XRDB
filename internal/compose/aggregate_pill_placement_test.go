package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func dualRatings() []provider.Rating {
	return []provider.Rating{
		{Source: "rt", Value: 8.6, Label: "8.6"},
		{Source: "imdb", Value: 8.8, Label: "8.8"},
	}
}

func dualConfig() imageconfig.Config {
	return imageconfig.Config{Ratings: []string{"rt", "imdb"}}
}

func renderDual(cfg imageconfig.Config, labeled bool) *image.NRGBA {
	img := genreTestImage()
	drawDualRating(img, dualRatings(), nil, false, cfg, 1.0, newOccupancy(img.Bounds()), labeled)
	return img
}

// Scale, offsets and position reached every other badge family but not the dual
// pills, so tuning them produced a byte-identical render.
func TestDualRatingHonoursTheRatingFineTuning(t *testing.T) {
	base := renderDual(dualConfig(), false)

	for name, mutate := range map[string]func(*imageconfig.Config){
		"scale":    func(c *imageconfig.Config) { c.RatingBadgeScale = 115 },
		"offsetX":  func(c *imageconfig.Config) { c.RatingBadgeOffsetX = -15 },
		"offsetY":  func(c *imageconfig.Config) { c.RatingBadgeOffsetY = -20 },
		"position": func(c *imageconfig.Config) { c.AggregatePillPos = "tr" },
	} {
		cfg := dualConfig()
		mutate(&cfg)
		if !imagesDiffer(base, renderDual(cfg, false)) {
			t.Errorf("dual-minimal %s did not change the render", name)
		}
	}
}

// The labelled dual mode takes the same tuning.
func TestLabelledDualRatingHonoursTheRatingFineTuning(t *testing.T) {
	cfg := dualConfig()
	cfg.AggregatePillPos = "br"
	if !imagesDiffer(renderDual(dualConfig(), true), renderDual(cfg, true)) {
		t.Error("dual position did not change the render")
	}
}

// Left unplaced the pair keeps its own look: one pill against each edge.
func TestAnUnplacedDualPairKeepsOppositeEdges(t *testing.T) {
	img := renderDual(dualConfig(), false)
	top, bottom := paintedHalves(img)
	if !top || !bottom {
		t.Errorf("expected a pill against each edge, got top=%v bottom=%v", top, bottom)
	}
}

// A placed pair stacks together at the named corner instead of splitting.
func TestAPlacedDualPairStacksAtOneCorner(t *testing.T) {
	cfg := dualConfig()
	cfg.AggregatePillPos = "tr"
	top, bottom := paintedHalves(renderDual(cfg, false))
	if !top || bottom {
		t.Errorf("expected both pills in the top half, got top=%v bottom=%v", top, bottom)
	}

	cfg.AggregatePillPos = "br"
	top, bottom = paintedHalves(renderDual(cfg, false))
	if top || !bottom {
		t.Errorf("expected both pills in the bottom half, got top=%v bottom=%v", top, bottom)
	}
}

// Stacking at a corner must not overlap the two pills.
func TestAStackedDualPairDrawsTwoSeparateRows(t *testing.T) {
	cfg := dualConfig()
	cfg.AggregatePillPos = "tr"
	rows := paintedRowRuns(renderDual(cfg, false))
	if rows != 2 {
		t.Errorf("expected two separated pill rows, got %d", rows)
	}
}

// The single-pill presentations take the same placement.
func TestAverageAndMinimalHonourThePillPosition(t *testing.T) {
	for name, draw := range map[string]func(*image.NRGBA, imageconfig.Config){
		"average": func(img *image.NRGBA, c imageconfig.Config) {
			drawAverageRating(img, dualRatings(), nil, false, c, 1.0, newOccupancy(img.Bounds()))
		},
		"minimal": func(img *image.NRGBA, c imageconfig.Config) {
			drawMinimalRating(img, dualRatings(), nil, false, c, 1.0, newOccupancy(img.Bounds()))
		},
	} {
		def := genreTestImage()
		draw(def, dualConfig())
		cfg := dualConfig()
		cfg.AggregatePillPos = "bl"
		moved := genreTestImage()
		draw(moved, cfg)
		if !imagesDiffer(def, moved) {
			t.Errorf("%s pill position did not change the render", name)
		}
		if _, bottom := paintedHalves(moved); !bottom {
			t.Errorf("%s pill did not move to the bottom", name)
		}
	}
}

// paintedHalves reports which halves of the frame carry drawn pixels. The test
// image starts uniform, so any change is an overlay.
func paintedHalves(img *image.NRGBA) (top, bottom bool) {
	b := img.Bounds()
	mid := b.Min.Y + b.Dy()/2
	blank := genreTestImage()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y) == blank.NRGBAAt(x, y) {
				continue
			}
			if y < mid {
				top = true
			} else {
				bottom = true
			}
		}
	}
	return top, bottom
}

// paintedRowRuns counts the bands of consecutive painted rows, so two stacked
// pills read as two runs and overlapping ones as a single run.
func paintedRowRuns(img *image.NRGBA) int {
	b := img.Bounds()
	blank := genreTestImage()
	runs, inRun := 0, false
	for y := b.Min.Y; y < b.Max.Y; y++ {
		painted := false
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y) != blank.NRGBAAt(x, y) {
				painted = true
				break
			}
		}
		if painted && !inRun {
			runs++
		}
		inRun = painted
	}
	return runs
}
