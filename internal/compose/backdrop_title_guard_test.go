package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// The guard asked only about poster art, so a backdrop carrying its own title
// fell through it and the logo overlay printed the title a second time.
func TestArtworkCarriesTitleChecksTheSurfaceBeingDrawn(t *testing.T) {
	base := func() *provider.MediaMeta {
		return &provider.MediaMeta{
			PosterURL:      "https://img/poster.jpg",
			PosterTextless: true,
			BackdropURL:    "https://img/backdrop.jpg",
			LogoURL:        "https://img/logo.png",
		}
	}
	cfg := imageconfig.Config{BackdropLogo: true}

	withTitle := base()
	withTitle.BackdropHasTitle = true
	if !artworkCarriesTitle(withTitle, "backdrop", cfg) {
		t.Error("a backdrop with the title baked in was not detected, so the logo draws over it")
	}

	textless := base()
	textless.BackdropHasTitle = false
	if artworkCarriesTitle(textless, "backdrop", cfg) {
		t.Error("a textless backdrop was blocked from taking the logo overlay")
	}

	// A logo render is the title, so it is never blocked.
	if artworkCarriesTitle(withTitle, "logo", cfg) {
		t.Error("a logo render was treated as already carrying the title")
	}
}
