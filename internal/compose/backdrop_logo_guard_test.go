package compose

import (
	"context"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// renderWithBackdropLogo reports whether the title logo was composited when the
// explicit Backdrop logo switch is on, against a poster that is or is not
// language-neutral.
func renderWithBackdropLogo(t *testing.T, surface string, textless bool, backdrop string) bool {
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
	cfg.BackdropLogo = true
	if _, err := p.Render(context.Background(), Request{MediaType: surface, MediaID: "tt1", Config: cfg}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	return logoFetched
}

// Whether the title is already in the artwork is a property of the artwork, not
// of the switch that asked for the logo. The Backdrop logo switch used to skip
// the check the clean path applies, so turning it on over ordinary poster art
// printed the title twice.
func TestBackdropLogoDoesNotDrawOverArtThatAlreadyHasATitle(t *testing.T) {
	if renderWithBackdropLogo(t, "poster", false, "") {
		t.Error("the logo was composited onto poster art that carries its own title")
	}
}

func TestBackdropLogoStillDrawsOnTextlessPosterArt(t *testing.T) {
	if !renderWithBackdropLogo(t, "poster", true, "") {
		t.Error("no logo was composited onto genuinely textless art")
	}
}

// A backdrop is language-neutral by nature, so a poster carrying a title must
// not hold back the overlay on a surface that never uses the poster. This is the
// switch's actual purpose and it has to keep working.
func TestBackdropLogoStillDrawsOnTheBackdropSurface(t *testing.T) {
	if !renderWithBackdropLogo(t, "backdrop", false, "http://fake/backdrop.jpg") {
		t.Error("the backdrop surface lost its logo because the poster had a title")
	}
}
