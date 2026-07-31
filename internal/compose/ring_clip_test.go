package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// FR-127: the rating ring, glow and all, must sit fully inside the canvas in a
// corner rather than being clipped by the edge. Any ink in the first column or
// row that the ring produced would mean it reached the very edge.
func TestRatingRingStaysInsideTheCanvasCorner(t *testing.T) {
	ensureFaces()
	ratings := []provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}}

	for _, ringScale := range []int{100, 200} {
		cfg := imageconfig.Default()
		cfg.Ratings = []string{"imdb"}
		cfg.RatingRing = true
		cfg.RatingRingPos = "tl"
		cfg.RingScale = ringScale

		img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
		drawAverageRatingRing(img, ratings, cfg, 2.0, newOccupancy(img.Bounds()))

		// The glow fades to nothing before the edge, so the outermost pixels must
		// be clear. A clipped ring would paint hard ink right at x=0 / y=0.
		edgeInk := 0
		for y := 0; y < 600; y++ {
			if img.NRGBAAt(0, y).A > 40 {
				edgeInk++
			}
		}
		for x := 0; x < 400; x++ {
			if img.NRGBAAt(x, 0).A > 40 {
				edgeInk++
			}
		}
		if edgeInk > 0 {
			t.Errorf("ringScale %d: ring painted %d strong pixels on the canvas edge (clipped)", ringScale, edgeInk)
		}
	}
}
