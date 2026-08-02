package compose

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The rating logos live in one place, web/public/rating-logos, and the PNGs the
// renderer embeds are generated from them by `npm run gen:icons`. The two sets
// drifting apart is what had the renderer drawing a tinted greyscale silhouette
// while the site showed the branded mark (BUG-192). This guard keeps them in
// step without a hand-kept list.
//
// It cannot rasterise an SVG in Go, so it does not diff pixels. It enforces the
// two properties that catch the drift that actually happened: every source has a
// render asset and vice versa, and every asset generated from a vector logo is
// branded rather than greyscale. A skipped regeneration that leaves a vector
// logo greyscale fails the second check; a logo added to one set only fails the
// first.
func TestRatingIconsStayInStepWithTheBrandedSet(t *testing.T) {
	webDir := filepath.Join("..", "..", "web", "public", "rating-logos")
	renderDir := filepath.Join("assets", "ratings")

	webSource := map[string]string{} // base name -> extension (.svg | .png)
	webEnts, err := os.ReadDir(webDir)
	if err != nil {
		t.Fatalf("cannot read the branded logo set at %s: %v", webDir, err)
	}
	for _, e := range webEnts {
		n := e.Name()
		if ext := filepath.Ext(n); ext == ".svg" || ext == ".png" {
			webSource[strings.TrimSuffix(n, ext)] = ext
		}
	}

	render := map[string]bool{}
	rEnts, err := os.ReadDir(renderDir)
	if err != nil {
		t.Fatalf("cannot read the render asset set at %s: %v", renderDir, err)
	}
	for _, e := range rEnts {
		if filepath.Ext(e.Name()) == ".png" {
			render[strings.TrimSuffix(e.Name(), ".png")] = true
		}
	}

	for name := range webSource {
		if !render[name] {
			t.Errorf("%q has a branded logo but no render asset — run `npm run gen:icons`", name)
		}
	}
	for name := range render {
		if _, ok := webSource[name]; !ok {
			t.Errorf("%q has a render asset but no branded logo behind it — the render set has drifted", name)
		}
	}

	// A render asset generated from a vector logo must carry that logo's colour.
	// This is the BUG-192 regression check: a greyscale asset for an SVG source
	// means the regeneration was skipped and the renderer is back to tinting a
	// silhouette. PNG sources (a logo with no vector, e.g. rogerebert) are
	// whatever they are and exempt.
	ensureIcons()
	for name, ext := range webSource {
		if ext != ".svg" {
			continue
		}
		if _, loaded := ratingIcons[name]; !loaded {
			t.Errorf("%q is a branded logo but its render asset did not load", name)
			continue
		}
		if !ratingIconColored[name] {
			t.Errorf("%q comes from a vector logo but its render asset is greyscale — regenerate with `npm run gen:icons`", name)
		}
	}
}
