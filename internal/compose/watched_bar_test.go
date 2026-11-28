package compose

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/draw"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func grayPoster(w, h int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{128, 128, 128, 255}}, image.Point{}, draw.Src)
	return img
}

func TestTheWatchedBarFillsToThePercent(t *testing.T) {
	img := grayPoster(500, 750)
	drawWatchedBar(img, 40, imageconfig.Default())

	bottom := img.Bounds().Max.Y - 1
	if got := img.NRGBAAt(100, bottom); got.R <= 200 {
		t.Errorf("inside the fill the bottom row is %v, want near white", got)
	}
	if got := img.NRGBAAt(300, bottom); got.R >= 128 {
		t.Errorf("past the fill the bottom row is %v, want the darkened track", got)
	}
	if got := img.NRGBAAt(100, bottom-40); got.R != 128 {
		t.Errorf("above the bar the art changed to %v", got)
	}
}

func TestNoBarIsDrawnAtZero(t *testing.T) {
	img := grayPoster(500, 750)
	before := append([]byte(nil), img.Pix...)
	drawWatchedBar(img, 0, imageconfig.Default())
	if !bytes.Equal(before, img.Pix) {
		t.Error("a zero percent changed the poster")
	}
}

func TestTheWatchedBarSitsAboveABottomAggregateBar(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.AggregateBar = true
	cfg.AggregateBarPos = "bottom"
	img := grayPoster(500, 750)
	drawWatchedBar(img, 100, cfg)
	if got := img.NRGBAAt(10, img.Bounds().Max.Y-1); got.R != 128 {
		t.Errorf("the aggregate bar's own row was drawn over: %v", got)
	}
}

func TestTheWatchedBarIsDrawnOnlyWhenTheConfigAndPercentBothAskForIt(t *testing.T) {
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://art/poster"},
	}
	p := &Pipeline{providers: testRegistry(stub), fetcher: &stubImageFetcher{data: makeTestPNG(500, 750, color.NRGBA{128, 128, 128, 255})}}
	render := func(on bool, pct int) []byte {
		t.Helper()
		cfg := imageconfig.Default()
		cfg.WatchedProgress = on
		res, err := p.Render(context.Background(), Request{MediaType: "poster", MediaID: "tt0816692", Config: cfg, WatchedPercent: pct})
		if err != nil || res.Placeholder {
			t.Fatalf("render: %v placeholder=%v", err, res != nil && res.Placeholder)
		}
		return res.ImageBytes
	}
	plain := render(false, 0)
	if !bytes.Equal(plain, render(false, 60)) {
		t.Error("a percent drew a bar with the setting off")
	}
	if !bytes.Equal(plain, render(true, 0)) {
		t.Error("the setting drew a bar with no percent")
	}
	if bytes.Equal(plain, render(true, 60)) {
		t.Error("the setting and a percent drew no bar")
	}
}
