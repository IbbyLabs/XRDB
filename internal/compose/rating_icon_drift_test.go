package compose

import (
	"image"
	"image/color"
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

	// The BUG-192 regression was a branded mark collapsing to a single colour
	// (18 distinct down to 1), which the old "is it greyscale" check missed: a
	// flat one-colour glyph is not greyscale and passed. This measures the result
	// instead — a mark must not flatten to near one colour. The marks the renderer
	// tints from a single-colour glyph are legitimately low-colour, so they are
	// listed rather than caught; adding a new one is a deliberate line here, not a
	// silent pass.
	// critics-rotten is the exception that is low-colour by design rather than by
	// tinting: the Rotten Tomatoes splat is a flat single green drawn as-is, so it
	// sits at one bucket with nothing to collapse from.
	monochromeMarks := map[string]bool{
		"allocine": true, "kitsu": true, "simkl": true, "trakt": true, "rt": true,
		"critics-rotten": true,
	}
	ensureIcons()
	for name := range render {
		img, ok := ratingIcons[name]
		if !ok {
			continue // the parity check above already reports a load failure
		}
		if monochromeMarks[name] {
			continue
		}
		if c := distinctColorBuckets(img); c < 3 {
			t.Errorf("%q has collapsed to %d distinct colours — a branded mark must not flatten to one; if it is intentionally monochrome (tinted at render) add it to monochromeMarks and say why", name, c)
		}
	}
}

// distinctColorBuckets counts the distinct colours in a mark, quantised into a
// coarse grid and ignoring near-transparent edge pixels, so anti-aliasing does
// not inflate the count. It is a collapse detector, not a palette measure.
func distinctColorBuckets(img image.Image) int {
	const quant, alphaMin = 48, 40
	seen := map[[3]uint8]bool{}
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
			if c.A < alphaMin {
				continue
			}
			seen[[3]uint8{c.R / quant, c.G / quant, c.B / quant}] = true
		}
	}
	return len(seen)
}
