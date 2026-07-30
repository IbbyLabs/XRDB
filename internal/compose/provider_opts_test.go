package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func providerChips() []provider.WatchProvider {
	return []provider.WatchProvider{{ID: 8, Name: "Netflix"}, {ID: 350, Name: "Apple TV+"}}
}

func renderProviders(opts providerBadgeOpts) *image.NRGBA {
	img := genreTestImage()
	drawProviderBadges(img, providerChips(), 1.0, newOccupancy(img.Bounds()), opts)
	return img
}

// Every other badge family threads an opts struct, so a config can size and
// place it. The streaming chips took a tile colour and nothing else, which left
// them fixed next to badges the user could resize.
func TestProviderBadgesTakeScalePositionAndOffsets(t *testing.T) {
	base := renderProviders(providerBadgeOpts{})

	for name, opts := range map[string]providerBadgeOpts{
		"scale":    {scalePercent: 160},
		"position": {pos: "tl"},
		"offsetX":  {offsetX: 40},
		"offsetY":  {offsetY: -40},
	} {
		if !imagesDiffer(base, renderProviders(opts)) {
			t.Errorf("provider %s did not change the render", name)
		}
	}
}

// Unplaced, the chips keep the wide strip centred along the bottom.
func TestUnplacedProviderChipsStayOnTheBottomStrip(t *testing.T) {
	top, bottom := paintedHalves(renderProviders(providerBadgeOpts{}))
	if top || !bottom {
		t.Errorf("expected the strip along the bottom, got top=%v bottom=%v", top, bottom)
	}
}

// A chosen position hands them to the shared corner placement.
func TestAPlacedProviderStripMovesToThatCorner(t *testing.T) {
	top, bottom := paintedHalves(renderProviders(providerBadgeOpts{pos: "tl"}))
	if !top || bottom {
		t.Errorf("expected the strip in the top half, got top=%v bottom=%v", top, bottom)
	}
}

// The config has to reach the drawing function, which is the whole gap.
func TestProviderOptsComeFromTheConfig(t *testing.T) {
	cfg := imageconfig.Config{}
	cfg.ProvidersPos = "tr"
	cfg.ProviderBadgeScale = 150
	cfg.ProviderBadgeOffsetX = 12
	cfg.ProviderBadgeOffsetY = -8
	cfg.NetworkTileColor = "#123456"

	got := providerOptsFromConfig(cfg)
	want := providerBadgeOpts{pos: "tr", scalePercent: 150, offsetX: 12, offsetY: -8, tileColor: "#123456"}
	if got != want {
		t.Errorf("providerOptsFromConfig = %+v, want %+v", got, want)
	}
}

// The controls reach the renderer through the config URL, so they have to parse.
func TestProviderControlsParse(t *testing.T) {
	cfg := imageconfig.Parse([]byte(`{"providersPos":"tl","providerBadgeScale":150,"providerBadgeOffsetX":-20,"providerBadgeOffsetY":30}`))
	if cfg.ProvidersPos != "tl" || cfg.ProviderBadgeScale != 150 || cfg.ProviderBadgeOffsetX != -20 || cfg.ProviderBadgeOffsetY != 30 {
		t.Errorf("provider controls did not parse: %+v", providerOptsFromConfig(cfg))
	}
	// Out-of-range values clamp rather than reaching the renderer. The ceiling is
	// 400, matching the rating badges: 200 was still small on a large poster.
	if s := imageconfig.Parse([]byte(`{"providerBadgeScale":9000}`)).ProviderBadgeScale; s != 400 {
		t.Errorf("scale clamped to %d, want 400", s)
	}
	if p := imageconfig.Parse([]byte(`{"providersPos":"sideways"}`)).ProvidersPos; p != "" {
		t.Errorf("an unknown position survived as %q", p)
	}
}
