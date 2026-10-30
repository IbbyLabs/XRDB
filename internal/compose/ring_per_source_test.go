package compose

import (
	"image"
	"image/png"
	"os"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

var perSourceRatings = []provider.Rating{
	{Source: "imdb", Value: 8.3},
	{Source: "tmdb", Value: 6.1},
	{Source: "rt", Value: 4.2},
}

func perSourceConfig() imageconfig.Config {
	cfg := imageconfig.Default()
	cfg.RatingRing = true
	cfg.RingPerSource = true
	cfg.Ratings = []string{"imdb", "tmdb", "rt", "metacritic"}
	return cfg
}

func TestPerSourceRingsFollowTheSelectedOrderAndSkipUnrated(t *testing.T) {
	got := perSourceRings(perSourceRatings, perSourceConfig())
	if len(got) != 3 || got[0].source != "imdb" || got[1].source != "tmdb" || got[2].source != "rt" {
		t.Fatalf("rings = %+v", got)
	}
	cfg := perSourceConfig()
	cfg.RatingProviderWeights = map[string]float64{"tmdb": 0}
	if got := perSourceRings(perSourceRatings, cfg); len(got) != 2 || got[1].source != "rt" {
		t.Errorf("a source weighted to zero still drew a ring: %+v", got)
	}
}

// Each ring is coloured by its own score, so a high and a low source differ.
func TestPerSourceRingsAreColouredBySource(t *testing.T) {
	cfg := perSourceConfig()
	high := ratingRingFillColor(8.3, cfg.RatingRingColor, cfg.AggregateDynamicStops)
	low := ratingRingFillColor(4.2, cfg.RatingRingColor, cfg.AggregateDynamicStops)
	if high == low {
		t.Fatalf("8.3 and 4.2 share a ring colour %v", high)
	}
	img := genreTestImage()
	occ := newOccupancy(img.Bounds())
	if !drawPerSourceRings(img, perSourceRatings, cfg, 1, occ) {
		t.Fatal("drew nothing")
	}
	if out := os.Getenv("RING_PREVIEW"); out != "" {
		f, _ := os.Create(out)
		_ = png.Encode(f, img)
		_ = f.Close()
	}
}

// The row is reserved as one block and stays inside the canvas even with the
// maximum ring count on a small thumbnail.
func TestPerSourceRingsStayInsideTheCanvas(t *testing.T) {
	cfg := perSourceConfig()
	cfg.RingScale = 250
	cfg.Ratings = []string{"imdb", "tmdb", "rt", "metacritic", "letterboxd", "trakt", "mal"}
	var ratings []provider.Rating
	for _, s := range cfg.Ratings {
		ratings = append(ratings, provider.Rating{Source: s, Value: 7})
	}
	img := image.NewNRGBA(image.Rect(0, 0, 400, 225))
	occ := newOccupancy(img.Bounds())
	if !drawPerSourceRings(img, ratings, cfg, 1, occ) {
		t.Fatal("drew nothing")
	}
	if n := len(perSourceRings(ratings, cfg)); n != maxSourceRings {
		t.Errorf("drew %d rings, want the cap of %d", n, maxSourceRings)
	}
	for _, r := range occ.rects {
		if !r.In(img.Bounds()) {
			t.Errorf("reserved %v outside the canvas %v", r, img.Bounds())
		}
	}
}

func TestPerSourceFallsBackToTheCombinedRingWithNoRatedSource(t *testing.T) {
	cfg := perSourceConfig()
	img := genreTestImage()
	if drawPerSourceRings(img, []provider.Rating{{Source: "trakt", Value: 7}}, cfg, 1, newOccupancy(img.Bounds())) {
		t.Error("drew rings for sources that are not selected")
	}
}
