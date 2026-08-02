package compose

import (
	"image"
	"os"
	"regexp"
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

// The unit checks above supply the order themselves, so they cannot see the
// order change in the pipeline, and the property is an ordering rather than a
// shape: a render only exposes it where two overlays happen to contend, which
// makes any single config a coverage claim to defend. So this reads the order
// the pipeline is written in. The behavioural evidence is a sweep of every
// genre and ring position: moving the ring ahead of the strips changed 112 of
// 1152 renders and every one of them had the ring turned on.
//
// The rule, not this ordering. An overlay that cannot shrink has to claim its
// place before one that can, whichever gets added next. A draw call in neither
// list fails here, so a new overlay cannot arrive without someone deciding
// which it is.
var inelasticOverlays = []string{
	// Fixed circle: it can neither narrow nor change corner.
	"drawAverageRatingRing(composed",
	// Fixed-size, corner-anchored plates. Each claims its place through the
	// occupancy map and none of them can drop content to fit.
	"drawAgeRatingBadge(composed",
	"drawAwardsBadge(composed",
	"drawEditorialRating(composed",
	"drawMetaLine(composed",
	"drawQualityBadges(composed",
	"drawReleaseStatusBadge(composed",
	"drawStingerBadge(composed",
	"drawTopRatedBadge(composed",
}

var elasticOverlays = []string{
	"drawGenreBadge(composed",     // drops a genre
	"drawProviderBadges(composed", // drops a chip
}

// knownOutOfOrder names an inelastic overlay still drawn after an elastic one.
// The trending tag claims a corner and cannot shrink, so a long genre list or a
// wide provider row can push it down rather than the strip trimming to fit
// beside it — BUG-189 with a different victim. Moving it changes every poster
// carrying trending plus a strip, so it wants its own sweep rather than riding
// along with the ring.
//
// It is asserted to still be out of order, so fixing it fails here and asks for
// the entry to go. An overlay added out of order is not covered by this and
// fails as a violation.
var knownOutOfOrder = map[string]string{
	"drawTrendingBadgeSurfaced(composed": "pre-existing; needs its own blast-radius sweep",
}

// unrankedOverlays never touch the occupancy map: they are centred, drawn into
// a box another overlay already reserved, or the artwork itself.
var unrankedOverlays = []string{
	"drawAggregateBar(composed",
	"drawAverageRating(composed",
	"drawBackdropLogoOverlay(composed",
	"drawBadgesInPlace(composed",
	"drawDualRating(composed",
	"drawMinimalRating(composed",
}

func TestThePipelineReservesInelasticOverlaysFirst(t *testing.T) {
	src, err := os.ReadFile("compose.go")
	if err != nil {
		t.Fatalf("cannot read the pipeline: %v", err)
	}
	body := string(src)

	known := map[string]bool{}
	for _, set := range [][]string{inelasticOverlays, elasticOverlays, unrankedOverlays} {
		for _, name := range set {
			known[name] = true
		}
	}
	for name := range knownOutOfOrder {
		known[name] = true
	}
	for _, found := range regexp.MustCompile(`draw[A-Za-z]+\(composed`).FindAllString(body, -1) {
		if !known[found] {
			t.Errorf("%s is drawn here and is in none of the overlay lists. Decide whether it can "+
				"shrink: one that cannot has to reserve before one that can", found)
		}
	}

	// Every call site, not the first: an overlay drawn in two places is only
	// half-checked otherwise, and drawAggregateBar is drawn twice.
	sites := func(name string) []int {
		var out []int
		for i := strings.Index(body, name); i >= 0; {
			out = append(out, i)
			next := strings.Index(body[i+1:], name)
			if next < 0 {
				break
			}
			i += 1 + next
		}
		return out
	}

	firstElastic := -1
	lastElastic := -1
	for _, gives := range elasticOverlays {
		at := sites(gives)
		if len(at) == 0 {
			t.Errorf("%s is listed but no longer drawn here", gives)
			continue
		}
		if firstElastic < 0 || at[0] < firstElastic {
			firstElastic = at[0]
		}
		if at[len(at)-1] > lastElastic {
			lastElastic = at[len(at)-1]
		}
	}
	for name, why := range knownOutOfOrder {
		at := sites(name)
		if len(at) == 0 {
			t.Errorf("%s is listed as out of order but no longer drawn here", name)
			continue
		}
		if at[len(at)-1] > lastElastic {
			continue // still out of order, as recorded
		}
		t.Errorf("%s now reserves before the elastic overlays (%s); move it into "+
			"inelasticOverlays and drop this entry", name, why)
	}

	for _, fixed := range inelasticOverlays {
		at := sites(fixed)
		if len(at) == 0 {
			t.Errorf("%s is listed but no longer drawn here", fixed)
			continue
		}
		if firstElastic >= 0 && at[len(at)-1] > firstElastic {
			t.Errorf("%s is drawn after an overlay that can shrink, so the one that cannot is "+
				"what gets displaced", fixed)
		}
	}
}
