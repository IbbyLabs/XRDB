package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func pillCanvas() *image.NRGBA { return image.NewNRGBA(image.Rect(0, 0, 400, 600)) }

func inkCount(img *image.NRGBA) int {
	n := 0
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y).A > 0 {
				n++
			}
		}
	}
	return n
}

// A mark on the compact average pill has to widen the capsule, not merely be
// accepted by the parser.
func TestPillIconWidensTheAveragePill(t *testing.T) {
	ensureFaces()
	ensureIcons()

	ratings := []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}
	plain := imageconfig.Default()
	plain.Ratings = []string{"imdb"}
	marked := plain
	marked.AggregatePillIcon = "imdb"

	a, b := pillCanvas(), pillCanvas()
	drawAverageRating(a, ratings, nil, false, plain, 1.0, &occupancy{})
	drawAverageRating(b, ratings, nil, false, marked, 1.0, &occupancy{})

	if inkCount(b) <= inkCount(a) {
		t.Errorf("the mark drew nothing: plain=%d marked=%d", inkCount(a), inkCount(b))
	}
	if w := scorePillWidth("AVG", "8.4", pillMark("imdb"), 1.0); w <= scorePillWidth("AVG", "8.4", nil, 1.0) {
		t.Error("the mark did not widen the capsule")
	}
}

// An unknown name leaves the pill exactly as it was rather than reserving space
// for a mark that never draws.
func TestUnknownPillIconIsIgnored(t *testing.T) {
	ensureIcons()
	if pillMark("not-a-real-source") != nil {
		t.Error("an unknown mark resolved to an image")
	}
	if pillMark("") != nil {
		t.Error("an empty name resolved to an image")
	}
}

// The dual pills need telling apart when they carry no label, which is the
// whole point of the marks.
func TestDualIconsMarkBothPills(t *testing.T) {
	ensureFaces()
	ensureIcons()

	ratings := []provider.Rating{
		{Source: "rt", Value: 92, Label: "92"},
		{Source: "rtaudience", Value: 87, Label: "87"},
	}
	plain := imageconfig.Default()
	plain.Ratings = []string{"rt", "rtaudience"}
	marked := plain
	marked.AggregateDualIcons = true

	a, b := pillCanvas(), pillCanvas()
	drawDualRating(a, ratings, nil, false, plain, 1.0, &occupancy{}, false)
	drawDualRating(b, ratings, nil, false, marked, 1.0, &occupancy{}, false)

	if inkCount(b) <= inkCount(a) {
		t.Errorf("the dual marks drew nothing: plain=%d marked=%d", inkCount(a), inkCount(b))
	}
}
