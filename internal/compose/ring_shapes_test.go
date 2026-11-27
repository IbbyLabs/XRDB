package compose

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func ringShapeRender(shape string, value float64, empty bool) *image.NRGBA {
	return ringShapeRenderWith(shape, value, empty, nil)
}

func ringShapeRenderWith(shape string, value float64, empty bool, mut func(*imageconfig.Config)) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, 640, 360))
	paintBackdropGradient(img)
	cfg := imageconfig.Config{Ratings: []string{"imdb"}, RatingRing: true, RatingRingPos: "tl", RatingRingPlaceholder: true}
	cfg.RingShape = shape
	if mut != nil {
		mut(&cfg)
	}
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
		{`{"ringShape":"Diamond"}`, "diamond"},
		{`{"ringShape":"seal"}`, "seal"},
		{`{"ringShape":"bars"}`, "bars"},
		{`{"ringShape":"fillpill"}`, "fillpill"},
		{`{"ringShape":" dial "}`, "dial"},
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

func TestSignalBarsLightToTheScore(t *testing.T) {
	for _, tc := range []struct {
		frac float64
		want int
	}{{0, 0}, {0.05, 0}, {0.48, 2}, {0.68, 3}, {0.77, 4}, {0.86, 4}, {0.95, 5}, {1, 5}, {1.4, 5}, {-1, 0}} {
		if got := litBars(tc.frac); got != tc.want {
			t.Errorf("litBars(%v) = %d, want %d", tc.frac, got, tc.want)
		}
	}
}

// The gauges fill in the score colour, so a higher score lights more of it.
func TestGaugeShapesFillWithTheScore(t *testing.T) {
	gold := func(c *imageconfig.Config) { c.RatingRingColor = "#f5c518" }
	lit := func(img *image.NRGBA) int {
		n := 0
		for y := 0; y < 200; y++ {
			for x := 0; x < 360; x++ {
				if p := img.NRGBAAt(x, y); p.R > 200 && p.G > 160 && p.B < 80 {
					n++
				}
			}
		}
		return n
	}
	for _, shape := range []string{"bars", "fillpill", "dial"} {
		low, high := lit(ringShapeRenderWith(shape, 3, false, gold)), lit(ringShapeRenderWith(shape, 9, false, gold))
		if low == 0 || high <= low {
			t.Errorf("%s: score 3 lit %d px, score 9 lit %d px; want more at 9", shape, low, high)
		}
		if n := lit(ringShapeRenderWith(shape, 0, true, gold)); n != 0 {
			t.Errorf("%s: an empty badge lit %d px in the score colour", shape, n)
		}
	}
}

func sortedRingShapes() []string {
	keys := make([]string, 0, len(ringShapeDrawers))
	for k := range ringShapeDrawers {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// BenchmarkRingShapes4K draws each shape on a 4K backdrop at Ring size 250.
func BenchmarkRingShapes4K(b *testing.B) {
	ensureFaces()
	ratings := []provider.Rating{{Source: "imdb", Value: 7.7, Label: "x"}}
	img := image.NewNRGBA(image.Rect(0, 0, 3840, 2160))
	paintBackdropGradient(img)
	for _, shape := range append([]string{"ring"}, sortedRingShapes()...) {
		cfg := imageconfig.Config{Ratings: []string{"imdb"}, RatingRing: true, RatingRingPos: "tl"}
		cfg.RingScale = 250
		if shape != "ring" {
			cfg.RingShape = shape
		}
		b.Run(shape, func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				drawAverageRatingRing(img, ratings, cfg, 3, newOccupancy(img.Bounds()))
			}
		})
	}
}

// RING_SHAPES_SHEET=/file.png writes one sheet: a row per shape, at four scores
// and then empty with the N/A marker.
func TestRingShapesContactSheet(t *testing.T) {
	out := os.Getenv("RING_SHAPES_SHEET")
	if out == "" {
		t.Skip("RING_SHAPES_SHEET not set")
	}
	const cw, ch = 300, 140
	shapes := sortedRingShapes()
	sheet := image.NewNRGBA(image.Rect(0, 0, cw*5, ch*len(shapes)))
	marker := func(c *imageconfig.Config) { c.PlaceholderStyle = "marker" }
	for row, shape := range shapes {
		cells := []*image.NRGBA{}
		for _, v := range []float64{4.8, 6.8, 7.7, 8.6} {
			cells = append(cells, ringShapeRender(shape, v, false))
		}
		cells = append(cells, ringShapeRenderWith(shape, 0, true, marker))
		for col, img := range cells {
			draw.Draw(sheet, image.Rect(col*cw, row*ch, (col+1)*cw, (row+1)*ch), img, image.Point{}, draw.Src)
		}
	}
	f, err := os.Create(out)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, sheet); err != nil {
		t.Fatal(err)
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
