package compose

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

// stubImageFetcher returns a fixed solid-color PNG.
type stubImageFetcher struct {
	data []byte
	err  error
}

func (s *stubImageFetcher) Fetch(_ context.Context, _ string) ([]byte, error) {
	return s.data, s.err
}

func makeTestPNG(w, h int, c color.NRGBA) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: c}, image.Point{}, draw.Src)
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func makeTestJPEG(w, h int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.RGBA{100, 100, 100, 255}}, image.Point{}, draw.Src)
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, img, nil)
	return buf.Bytes()
}

func testRegistry(prov provider.Provider) *provider.Registry {
	reg := provider.NewRegistry()
	reg.Register(prov)
	return reg
}

func TestRenderFallsBackToPlaceholderOnProviderError(t *testing.T) {
	stub := &provider.StubProvider{ProviderName: "tmdb", Err: fmt.Errorf("api down")}
	p := &Pipeline{providers: testRegistry(stub), fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt0816692", Config: imageconfig.Default()}
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(res.ImageBytes, render.PlaceholderPNG("poster")) {
		t.Error("expected fallback placeholder on provider error")
	}
}

func TestRenderFallsBackOnNoArtworkURL(t *testing.T) {
	stub := &provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{Title: "Test"}}
	p := &Pipeline{providers: testRegistry(stub), fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt0816692", Config: imageconfig.Default()}
	res, _ := p.Render(context.Background(), req)
	if !bytes.Equal(res.ImageBytes, render.PlaceholderPNG("poster")) {
		t.Error("expected fallback placeholder when no artwork URL")
	}
}

func TestRenderProducesCorrectDimensions(t *testing.T) {
	srcPNG := makeTestPNG(800, 1200, color.NRGBA{50, 50, 80, 255})
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	}
	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: srcPNG},
	}
	req := Request{
		MediaType: "poster",
		MediaID:   "tt0816692",
		Config:    imageconfig.Default(),
	}
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	img, err := png.Decode(bytes.NewReader(res.ImageBytes))
	if err != nil {
		t.Fatalf("decode result PNG: %v", err)
	}
	b := img.Bounds()
	want := render.DimensionsFor("poster")
	if b.Dx() != want.Width || b.Dy() != want.Height {
		t.Errorf("got %dx%d, want %dx%d", b.Dx(), b.Dy(), want.Width, want.Height)
	}
}

func TestRenderJPEGSource(t *testing.T) {
	srcJPEG := makeTestJPEG(640, 960)
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{PosterURL: "http://fake/poster.jpg"},
	}
	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: srcJPEG},
	}
	req := Request{MediaType: "poster", MediaID: "tt1", Config: imageconfig.Default()}
	res, _ := p.Render(context.Background(), req)
	if _, err := png.Decode(bytes.NewReader(res.ImageBytes)); err != nil {
		t.Errorf("expected valid PNG output from JPEG source: %v", err)
	}
}

func TestResizeFitDimensions(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 1000, 1500))
	out := resizeFit(src, 580, 859)
	b := out.Bounds()
	if b.Dx() != 580 || b.Dy() != 859 {
		t.Errorf("resizeFit: got %dx%d, want 580x859", b.Dx(), b.Dy())
	}
}

func TestBuildCacheKeyDeterministic(t *testing.T) {
	req := Request{MediaType: "poster", MediaID: "tt1", Config: imageconfig.Default()}
	k1 := buildCacheKey(req)
	k2 := buildCacheKey(req)
	if k1 != k2 {
		t.Error("buildCacheKey not deterministic")
	}
}
