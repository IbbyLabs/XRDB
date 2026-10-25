package compose

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func ringShapeRender(shape string, value float64, empty bool) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, 640, 360))
	paintBackdropGradient(img)
	cfg := imageconfig.Config{Ratings: []string{"imdb"}, RatingRing: true, RatingRingPos: "tl", RatingRingPlaceholder: true}
	cfg.RingShape = shape
	var ratings []provider.Rating
	if !empty {
		ratings = []provider.Rating{{Source: "imdb", Value: value, Label: "x"}}
	}
	drawAverageRatingRing(img, ratings, cfg, 1.5, newOccupancy(img.Bounds()))
	return img
}

func TestEveryRingShapeHasADrawer(t *testing.T) {
	for k := range imageconfig.RingShapes {
		if _, ok := ringShapeDrawers[k]; !ok {
			t.Errorf("ring shape %q is accepted by the config but has no drawer", k)
		}
	}
	for k := range ringShapeDrawers {
		if !imageconfig.RingShapes[k] {
			t.Errorf("ring shape %q has a drawer the config never accepts", k)
		}
	}
}

func TestRingShapesDrawDistinctBadges(t *testing.T) {
	ring := clonePixels(ringShapeRender("", 8.6, false))
	seen := map[[4]uint64]string{ring: "ring"}
	for shape := range ringShapeDrawers {
		got := clonePixels(ringShapeRender(shape, 8.6, false))
		if prev, ok := seen[got]; ok {
			t.Errorf("shape %q rendered the same as %q", shape, prev)
		}
		seen[got] = shape
		if clonePixels(ringShapeRender(shape, 4.8, false)) == got {
			t.Errorf("shape %q ignores the score colour", shape)
		}
		if clonePixels(ringShapeRender(shape, 0, true)) == got {
			t.Errorf("shape %q draws an empty badge like a scored one", shape)
		}
	}
}

func TestRingShapeConfigParses(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{`{"ringShape":"Hexagon"}`, "hexagon"},
		{`{"ringShape":"verdict"}`, "verdict"},
		{`{"ringShape":"nonesuch"}`, ""},
		{`{}`, ""},
	} {
		if got := imageconfig.Parse([]byte(tc.in)).RingShape; got != tc.want {
			t.Errorf("%s: ringShape = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestRingVerdictWords(t *testing.T) {
	for _, tc := range []struct {
		v    float64
		want string
	}{{4.8, "Poor"}, {6.8, "Mixed"}, {7.7, "Good"}, {8.6, "Great"}} {
		if got := ringVerdictWord(tc.v, "en"); got != tc.want {
			t.Errorf("ringVerdictWord(%v) = %q, want %q", tc.v, got, tc.want)
		}
	}
}

// RING_SHAPES_OUT=/dir writes one PNG per shape and score for eyeballing.
func TestRingShapesSheet(t *testing.T) {
	dir := os.Getenv("RING_SHAPES_OUT")
	if dir == "" {
		t.Skip("RING_SHAPES_OUT not set")
	}
	for shape := range ringShapeDrawers {
		for _, v := range []float64{4.8, 6.8, 7.7, 8.6} {
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-%02.0f.png", shape, v*10)))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, ringShapeRender(shape, v, false)); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
	}
}
