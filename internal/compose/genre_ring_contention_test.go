package compose

import (
	"image"
	"os"
	"strings"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// A long genre list used to span the whole bottom edge, so the rating ring —
// placed afterwards — was shifted off its corner and up the poster. The strip
// is the elastic one of the pair: it can drop a genre, and the ring cannot
// change size or corner. So the ring reserves first and the strip measures what
// is left. resolve only ever shifts, so without the measurement the strip would
// simply slide instead, which is the same defect wearing the other hat.

func contentionImage() *image.NRGBA { return image.NewNRGBA(image.Rect(0, 0, 600, 900)) }

func ringRect(t *testing.T, genres []string) (ring, strip image.Rectangle) {
	t.Helper()
	ratings := []provider.Rating{{Source: "imdb", Value: 8.0, Label: "8.0"}}
	cfg := imageconfig.Config{Ratings: []string{"imdb"}, RatingRing: true, RatingRingPos: "br"}
	img := contentionImage()
	occ := newOccupancy(img.Bounds())

	drawAverageRatingRing(img, ratings, cfg, 2.0, occ)
	before := len(occ.rects)
	if before == 0 {
		t.Fatal("the ring reserved nothing; this test cannot measure it")
	}
	ring = occ.rects[before-1]

	if len(genres) > 0 {
		drawGenreBadge(img, genres, "bl", 2.0, occ, genreBadgeOpts{})
		if len(occ.rects) > before {
			strip = occ.rects[len(occ.rects)-1]
		}
	}
	return ring, strip
}

func TestALongGenreListLeavesTheRingOnItsCorner(t *testing.T) {
	alone, _ := ringRect(t, nil)
	crowded, strip := ringRect(t, []string{
		"Action", "Drama", "Thriller", "Horror", "Comedy",
	})

	if crowded != alone {
		t.Errorf("a long genre list moved the ring from %v to %v; the ring cannot resize or "+
			"change corner, so the strip is what has to give", alone, crowded)
	}
	if strip.Empty() {
		t.Fatal("the genre strip reserved nothing")
	}
	if strip.Overlaps(alone) {
		t.Errorf("the genre strip %v overlaps the ring %v", strip, alone)
	}

	// Trimming, not sliding: resolve moves a strip that does not fit and never
	// narrows it, so a strip still on its own row is the proof it measured.
	short, shortStrip := ringRect(t, []string{"Drama"})
	if short != alone {
		t.Fatalf("a one-genre strip moved the ring to %v", short)
	}
	if strip.Min.Y != shortStrip.Min.Y {
		t.Errorf("the long strip sits at y=%d and the short one at y=%d, so it was pushed up "+
			"rather than trimmed to the room beside the ring", strip.Min.Y, shortStrip.Min.Y)
	}
}

// The unit checks above supply the order themselves, so they cannot see it
// change in the pipeline, and the property is an ordering rather than a shape:
// a render only shows it where the two happen to contend. So this reads the
// order the pipeline is written in. Measured over a sweep of every genre and
// ring position, moving the ring ahead of the strips changed 112 of 1152
// renders and every one of them had the ring turned on.
func TestThePipelineReservesTheRingBeforeTheStrips(t *testing.T) {
	src, err := os.ReadFile("compose.go")
	if err != nil {
		t.Fatalf("cannot read the pipeline: %v", err)
	}
	body := string(src)
	ring := strings.Index(body, "drawAverageRatingRing(composed")
	if ring < 0 {
		t.Fatal("the ring is no longer drawn here; this guard cannot run")
	}
	for _, elastic := range []string{"drawGenreBadge(composed", "drawProviderBadges(composed"} {
		at := strings.Index(body, elastic)
		if at < 0 {
			t.Fatalf("%s is no longer drawn here; this guard cannot run", elastic)
		}
		if at < ring {
			t.Errorf("%s reserves before the ring, so the ring is what gets displaced. The ring "+
				"cannot narrow or change corner and the strips can, so it claims its place first", elastic)
		}
	}
}
