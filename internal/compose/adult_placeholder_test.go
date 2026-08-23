package compose

import (
	"bytes"
	"context"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

// adultPipeline builds a pipeline whose source artwork is real and decodable,
// so a placeholder can only come from the flag rather than from a missing or
// broken image.
func adultPipeline(adult bool) (*Pipeline, Request) {
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			Title:     "Test",
			PosterURL: "https://example.invalid/poster.png",
			Adult:     adult,
		},
	}
	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{R: 10, G: 120, B: 200, A: 255})},
	}
	return p, Request{MediaType: "poster", MediaID: "tt0816692", Config: imageconfig.Default()}
}

func TestAdultFlaggedTitleRendersThePlaceholder(t *testing.T) {
	p, req := adultPipeline(true)
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !bytes.Equal(res.ImageBytes, render.PlaceholderPNG("poster")) {
		t.Error("a title TMDB flags as adult rendered its own artwork")
	}
	if !res.Placeholder {
		t.Error("Placeholder=false, so the caller would cache and reuse it")
	}
}

// The control for the test above. Same stub, same artwork, flag off: without
// this, a placeholder proves only that the pipeline produced one, and every way
// of breaking the fetch passes the first test.
func TestTheSameTitleUnflaggedRendersItsArtwork(t *testing.T) {
	p, req := adultPipeline(false)
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if bytes.Equal(res.ImageBytes, render.PlaceholderPNG("poster")) {
		t.Fatal("the unflagged control also rendered a placeholder, so the flag is not what the other test measured")
	}
	if res.Placeholder {
		t.Error("Placeholder=true on an unflagged title")
	}
}
