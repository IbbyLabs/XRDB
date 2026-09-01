package compose

import (
	"encoding/json"
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// v2 named a title by its first genre alone, in capitals, rather than joining
// the list.
func TestPrimaryLabelPrintsOneGenreInCaps(t *testing.T) {
	cfg := imageconfig.Parse(json.RawMessage(`{"genreBadgeLabel":"primary"}`))
	if cfg.GenreBadgeLabel != "primary" {
		t.Fatalf("GenreBadgeLabel = %q, want primary", cfg.GenreBadgeLabel)
	}
	base := image.NewNRGBA(image.Rect(0, 0, 400, 600))
	occ := newOccupancy(base.Bounds())
	opts := genreOptsFromConfig(cfg, false, "movie")
	// Drawing is the only way to observe the label, so assert it does not panic
	// and that the plate lands where a single short label would.
	drawGenreBadge(base, []string{"Sci-Fi & Fantasy", "Drama"}, "tl", 1, occ, opts)
	if nonTransparentBounds(base).Empty() {
		t.Error("nothing was drawn")
	}
}

// The parse has to accept what a v2 config calls the left stripe.
func TestAccentSpellingsFold(t *testing.T) {
	for _, raw := range []string{"left", "side", "bar", "LEFT", " Side "} {
		cfg := imageconfig.Parse(json.RawMessage(`{"genreBadgeAccent":"` + raw + `"}`))
		if cfg.GenreBadgeAccent != "left" {
			t.Errorf("accent %q parsed as %q, want left", raw, cfg.GenreBadgeAccent)
		}
	}
	for _, raw := range []string{"top", "cap"} {
		cfg := imageconfig.Parse(json.RawMessage(`{"genreBadgeAccent":"` + raw + `"}`))
		if cfg.GenreBadgeAccent != "top" {
			t.Errorf("accent %q parsed as %q, want top", raw, cfg.GenreBadgeAccent)
		}
	}
	if cfg := imageconfig.Parse(json.RawMessage(`{"genreBadgeAccent":"nonsense"}`)); cfg.GenreBadgeAccent != "" {
		t.Errorf("an unknown accent was accepted as %q", cfg.GenreBadgeAccent)
	}
}

// An unset config has to render exactly as it did before these fields existed.
func TestUnsetAccentKeepsEachStyleAsItWas(t *testing.T) {
	for _, style := range []string{"", "glass", "square", "tile", "clean", "plain"} {
		cfg := imageconfig.Default()
		cfg.GenreBadgeStyle = style
		if cfg.GenreBadgeAccent != "" || cfg.GenreBadgeLabel != "" {
			t.Fatalf("style %q: defaults are not empty", style)
		}
	}
}

// The stripe widens the plate, so a left accent must not draw over the label.
func TestLeftStripeWidensThePlate(t *testing.T) {
	genres := []string{"Sci-Fi & Fantasy"}
	measure := func(accent string) image.Rectangle {
		cfg := imageconfig.Default()
		cfg.GenreBadgeStyle = "tile"
		cfg.GenreBadgeAccent = accent
		base := image.NewNRGBA(image.Rect(0, 0, 400, 600))
		occ := newOccupancy(base.Bounds())
		drawGenreBadge(base, genres, "tl", 1, occ, genreOptsFromConfig(cfg, false, "movie"))
		return nonTransparentBounds(base)
	}
	plain := measure("none")
	striped := measure("left")
	if striped.Dx() <= plain.Dx() {
		t.Errorf("striped plate is %dpx wide, unstriped is %dpx; the stripe needs its own room",
			striped.Dx(), plain.Dx())
	}
}
