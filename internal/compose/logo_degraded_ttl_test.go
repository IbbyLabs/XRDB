package compose

import (
	"context"
	"errors"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// Fails the title-logo fetch and serves real art for everything else, so a test
// can drive the one path where the overlay is wanted but does not arrive.
type logoFailFetcher struct {
	data    []byte
	logoURL string
}

func (f *logoFailFetcher) Fetch(_ context.Context, url string) ([]byte, error) {
	if url == f.logoURL {
		return nil, errors.New("logo fetch failed")
	}
	return f.data, nil
}

// A wanted title logo whose fetch fails leaves the poster titleless. That render
// is real but incomplete, so it is marked degraded and the handler caps its
// cache TTL — otherwise one network blip is served for the full retention.
func TestLogoFetchFailureMarksRenderDegraded(t *testing.T) {
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL:      "http://fake/poster.jpg",
			LogoURL:        "http://fake/logo.png",
			PosterTextless: true, // textless, so the overlay is genuinely wanted
		},
	}
	cfg := imageconfig.Default()
	cfg.BackdropLogo = true
	cfg.Ratings = nil // isolate: no rating source can contribute to Degraded
	art := makeTestPNG(300, 450, color.NRGBA{50, 50, 80, 255})
	req := Request{MediaType: "poster", MediaID: "tt1", Config: cfg}

	okPipeline := &Pipeline{providers: testRegistry(stub), fetcher: &recordingFetcher{data: art}}
	okRes, err := okPipeline.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render with a working logo fetch: %v", err)
	}
	if okRes.Degraded {
		t.Fatal("a render whose logo fetch succeeded was marked degraded")
	}

	failPipeline := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &logoFailFetcher{data: art, logoURL: "http://fake/logo.png"},
	}
	failRes, err := failPipeline.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render with a failing logo fetch: %v", err)
	}
	if !failRes.Degraded {
		t.Error("a failed title-logo fetch left the render unmarked, so it would cache at the full TTL")
	}
}
