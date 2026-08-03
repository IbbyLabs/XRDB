package compose

import (
	"image"
	"sync"
	"testing"
)

// Font faces are cached and shared across renders, and font.Face is not safe for
// concurrent use: two renders rasterising a glyph at the same scale corrupt each
// other's mask buffer, which draws as a solid block. Run with -race; before the
// per-face lock this trips the detector on the shared label face.
func TestConcurrentTextDrawsAreRaceFree(t *testing.T) {
	ensureFaces()
	const goroutines, iterations = 8, 25
	genres := []string{"COMEDY", "DOCUMENTARY", "ACTION", "THRILLER"}

	var wg sync.WaitGroup
	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < iterations; i++ {
				img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
				// scale 1.0 resolves to the shared scale-1 faces; the same font
				// buffer every goroutine draws through.
				drawGenreBadge(img, genres, "bl", 1.0, newOccupancy(img.Bounds()), genreBadgeOpts{})
			}
		}()
	}
	wg.Wait()
}
