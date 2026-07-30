package compose

import (
	"context"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// renderClean reports whether the title logo was composited for a clean request
// against a source whose poster is or is not language-neutral.
func renderClean(t *testing.T, surface string, textless bool, backdrop string) bool {
	t.Helper()
	logoFetched := false
	fetcher := &recordingFetcher{
		data: makeTestPNG(300, 450, color.NRGBA{50, 50, 80, 255}),
		onFetch: func(url string) {
			if url == "http://fake/logo.png" {
				logoFetched = true
			}
		},
	}
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL:      "http://fake/poster.jpg",
			BackdropURL:    backdrop,
			LogoURL:        "http://fake/logo.png",
			PosterTextless: textless,
		},
	}
	p := &Pipeline{providers: testRegistry(stub), fetcher: fetcher}
	cfg := imageconfig.Default()
	cfg.TextPreference = imageconfig.TextClean
	if _, err := p.Render(context.Background(), Request{MediaType: surface, MediaID: "tt1", Config: cfg}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	return logoFetched
}

// A clean request TMDB cannot honour returns ordinary art with the title baked
// in. Trusting the requested preference drew the logo on top of it and printed
// the title twice.
func TestCleanDoesNotDrawTheLogoOverArtThatAlreadyHasATitle(t *testing.T) {
	if renderClean(t, "poster", false, "") {
		t.Error("the logo was composited onto art that carries its own title")
	}
}

// The honoured case still works, which is the whole point of clean.
func TestCleanStillDrawsTheLogoOnTextlessArt(t *testing.T) {
	if !renderClean(t, "poster", true, "") {
		t.Error("no logo was composited onto genuinely textless art")
	}
}

// A backdrop is language-neutral by nature, so a poster that carries a title
// must not suppress the overlay on a surface that never uses the poster.
func TestABackdropSurfaceKeepsItsLogoRegardlessOfThePoster(t *testing.T) {
	if !renderClean(t, "backdrop", false, "http://fake/backdrop.jpg") {
		t.Error("a backdrop surface lost its logo because the poster had a title")
	}
}
