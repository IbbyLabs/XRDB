package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func metaLineImage() *image.NRGBA { return image.NewNRGBA(image.Rect(0, 0, 340, 500)) }

// The line is the streaming-app summary: age rating, year, one genre. It is a
// summary rather than a list, so a title with five genres still shows one.
func TestMetaLinePartsSummarise(t *testing.T) {
	age, rest := metaLineParts(provider.MediaMeta{
		ContentRating: "PG-13",
		Year:          2008,
		Genres:        []string{"Action", "Crime", "Drama"},
	})
	if age != "PG-13" {
		t.Errorf("age = %q, want PG-13", age)
	}
	if len(rest) != 2 || rest[0] != "2008" || rest[1] != "Action" {
		t.Errorf("rest = %v, want [2008 Action]", rest)
	}
}

// Missing pieces are skipped rather than leaving stray separators.
func TestMetaLineHandlesMissingPieces(t *testing.T) {
	if age, rest := metaLineParts(provider.MediaMeta{Year: 1999}); age != "" || len(rest) != 1 {
		t.Errorf("year only: age=%q rest=%v", age, rest)
	}
	if age, rest := metaLineParts(provider.MediaMeta{ContentRating: "R"}); age != "R" || len(rest) != 0 {
		t.Errorf("rating only: age=%q rest=%v", age, rest)
	}
}

// Off by default, and drawing nothing when there is nothing to say.
func TestMetaLineDrawsOnlyWhenAskedAndWhenThereIsContent(t *testing.T) {
	meta := provider.MediaMeta{ContentRating: "PG", Year: 2020, Genres: []string{"Comedy"}}

	off := metaLineImage()
	drawMetaLine(off, meta, imageconfig.Default(), 2.0, newOccupancy(off.Bounds()))
	if paintedPixels(off) != 0 {
		t.Error("the meta line drew without being switched on")
	}

	cfg := imageconfig.Default()
	cfg.MetaLine = true

	empty := metaLineImage()
	drawMetaLine(empty, provider.MediaMeta{}, cfg, 2.0, newOccupancy(empty.Bounds()))
	if paintedPixels(empty) != 0 {
		t.Error("a title with no rating, year or genre still drew something")
	}

	on := metaLineImage()
	drawMetaLine(on, meta, cfg, 2.0, newOccupancy(on.Bounds()))
	if paintedPixels(on) == 0 {
		t.Fatal("nothing was drawn with the line switched on")
	}
}

// The scrim is what makes it readable on bright art, so it has to reach the
// bottom edge rather than sitting behind the text alone.
func TestMetaLineScrimReachesTheBottomEdge(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.MetaLine = true
	img := metaLineImage()
	// Start from opaque white: the scrim must darken the bottom row.
	for i := range img.Pix {
		img.Pix[i] = 255
	}
	drawMetaLine(img, provider.MediaMeta{ContentRating: "PG", Year: 2020}, cfg, 2.0, nil)

	b := img.Bounds()
	bottom := img.NRGBAAt(b.Dx()/2, b.Max.Y-1)
	top := img.NRGBAAt(b.Dx()/2, b.Min.Y)
	if bottom.R >= top.R {
		t.Errorf("bottom row (%d) is not darker than the top (%d); the scrim did not reach the edge", bottom.R, top.R)
	}
}

// The rating strip owns the bottom band, so the info line has to stack above it
// rather than print through it.
func TestMetaLineClearsAReservedBottomBand(t *testing.T) {
	ensureFaces()
	cfg := imageconfig.Default()
	cfg.MetaLine = true

	meta := provider.MediaMeta{Year: 1994, ContentRating: "R", Genres: []string{"Thriller"}}

	free := image.NewNRGBA(image.Rect(0, 0, 340, 500))
	drawMetaLine(free, meta, cfg, 1.0, &occupancy{})

	occupied := &occupancy{}
	band := image.Rect(0, 420, 340, 500)
	occupied.reserve(band)
	blocked := image.NewNRGBA(image.Rect(0, 0, 340, 500))
	drawMetaLine(blocked, meta, cfg, 1.0, occupied)

	inkRow := func(img *image.NRGBA) int {
		for y := img.Bounds().Max.Y - 1; y >= 0; y-- {
			for x := 0; x < img.Bounds().Max.X; x++ {
				if img.NRGBAAt(x, y).A > 0 {
					return y
				}
			}
		}
		return -1
	}
	if got := inkRow(blocked); got >= band.Min.Y {
		t.Errorf("the info line drew into the reserved band: lowest ink at y=%d, band starts at %d", got, band.Min.Y)
	}
	if inkRow(free) <= inkRow(blocked) {
		t.Error("the reserved band did not move the info line up")
	}
}
