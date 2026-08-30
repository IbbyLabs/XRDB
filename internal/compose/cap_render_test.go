package compose

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

func renderedBounds(t *testing.T, srcW, srcH int, size imageconfig.MediaSize) image.Rectangle {
	t.Helper()
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	}
	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: makeTestPNG(srcW, srcH, color.NRGBA{50, 50, 80, 255})},
	}
	cfg := imageconfig.Default()
	cfg.Size = size
	res, err := p.Render(context.Background(), Request{
		MediaType: "poster",
		MediaID:   "tt0816692",
		Config:    cfg,
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if res.Placeholder {
		t.Fatal("got a placeholder, so nothing was rendered from the source")
	}
	// Posters encode as JPEG unless the config asks otherwise, so decode by
	// sniffing rather than assuming a format.
	img, _, err := image.Decode(bytes.NewReader(res.ImageBytes))
	if err != nil {
		t.Fatalf("decode render: %v", err)
	}
	return img.Bounds()
}

// A source smaller than the 4K box is not stretched to fill it. This is the
// whole point of the cap and no other test reaches it: every existing compose
// fixture is smaller than the poster base, where the cap returns the base and
// changes nothing.
func TestA4KRenderIsCappedToItsSource(t *testing.T) {
	got := renderedBounds(t, 1000, 1500, imageconfig.Size4K)
	if got.Dx() != 1000 || got.Dy() != 1500 {
		t.Errorf("a 1000x1500 source rendered at %dx%d, want 1000x1500",
			got.Dx(), got.Dy())
	}
	full := render.DimensionsForSize("poster", "4k")
	if got.Dx() == full.Width {
		t.Errorf("render reached the uncapped %dx%d box", full.Width, full.Height)
	}
}

// A source that genuinely carries the pixels still gets the full box, so the cap
// does not quietly shrink every 4K render.
func TestA4KRenderKeepsItsBoxWhenTheSourceIsLargeEnough(t *testing.T) {
	full := render.DimensionsForSize("poster", "4k")
	got := renderedBounds(t, full.Width, full.Height, imageconfig.Size4K)
	if got.Dx() != full.Width || got.Dy() != full.Height {
		t.Errorf("a source at the full box rendered at %dx%d, want %dx%d",
			got.Dx(), got.Dy(), full.Width, full.Height)
	}
}

// Below the base size the cap yields the base rather than something smaller, so
// a 4K profile never delivers less than a normal one.
func TestATinySourceStillRendersAtTheBaseSize(t *testing.T) {
	base := render.DimensionsForSize("poster", "normal")
	got := renderedBounds(t, 300, 450, imageconfig.Size4K)
	if got.Dx() != base.Width || got.Dy() != base.Height {
		t.Errorf("a 300x450 source rendered at %dx%d, want the base %dx%d",
			got.Dx(), got.Dy(), base.Width, base.Height)
	}
}
