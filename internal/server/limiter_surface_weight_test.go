package server

import (
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
)

// A thumbnail draws 57,600 pixels against a poster's 912,600, so charging both
// the same let a burst of the cheapest renders fill the queue at the price of
// the dearest. Measured on 2026-08-24: a shed event was 96% logos and
// backdrops.
func TestRenderWeightPricesBySurface(t *testing.T) {
	cases := []struct {
		mediaType string
		size      imageconfig.MediaSize
		want      int64
	}{
		{"poster", imageconfig.SizeNormal, 4},
		{"poster", imageconfig.SizeLarge, 9},
		{"poster", imageconfig.Size4K, 36},
		{"backdrop", imageconfig.SizeNormal, 4},
		{"backdrop", imageconfig.Size4K, 36},
		{"logo", imageconfig.SizeNormal, 1},
		{"logo", imageconfig.SizeLarge, 2},
		{"logo", imageconfig.Size4K, 6},
		{"thumbnail", imageconfig.SizeNormal, 1},
		{"thumbnail", imageconfig.SizeLarge, 1},
		{"thumbnail", imageconfig.Size4K, 2},
		// An unrecognised surface is charged as a poster: guessing cheap would
		// hand a new route the whole budget.
		{"newsurface", imageconfig.SizeNormal, 4},
	}
	for _, c := range cases {
		if got := renderWeight(c.mediaType, c.size); got != c.want {
			t.Errorf("renderWeight(%q, %q) = %d, want %d", c.mediaType, c.size, got, c.want)
		}
	}
}

// The defect this fixes, stated as the property rather than the numbers: a 4K
// thumbnail delivers fewer pixels than a normal poster, so it must not cost
// more.
func TestFourKThumbnailCostsLessThanANormalPoster(t *testing.T) {
	thumb := renderWeight("thumbnail", imageconfig.Size4K)
	poster := renderWeight("poster", imageconfig.SizeNormal)
	if thumb >= poster {
		t.Errorf("4K thumbnail costs %d against a normal poster's %d; it draws 518,400 pixels against 912,600", thumb, poster)
	}
}

// XRDB_RENDER_CONCURRENCY keeps meaning "normal posters at once" after the
// units changed underneath it.
func TestConcurrencyStillCountsNormalPosters(t *testing.T) {
	l := newConcurrencyLimiter(64 * weightUnit)
	admitted := 0
	for i := 0; i < 64; i++ {
		if !l.acquireWithin(t.Context(), time.Second, renderWeight("poster", imageconfig.SizeNormal)) {
			break
		}
		admitted++
	}
	if admitted != 64 {
		t.Fatalf("admitted %d normal posters, want 64", admitted)
	}
	if l.acquireWithin(t.Context(), 20*time.Millisecond, renderWeight("poster", imageconfig.SizeNormal)) {
		t.Error("a 65th normal poster was admitted")
	}
}

// The intended consequence: small surfaces get more of the queue than posters
// do, so a burst of them is not shed at a poster's price.
func TestThumbnailsOutnumberPostersInOneBudget(t *testing.T) {
	l := newConcurrencyLimiter(64 * weightUnit)
	n := 0
	for l.acquireWithin(t.Context(), 20*time.Millisecond, renderWeight("thumbnail", imageconfig.SizeNormal)) {
		n++
		if n > 1000 {
			t.Fatal("thumbnail admission is unbounded")
		}
	}
	if n != 256 {
		t.Fatalf("admitted %d normal thumbnails, want 256", n)
	}
}
