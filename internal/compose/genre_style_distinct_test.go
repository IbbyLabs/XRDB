package compose

import (
	"image"
	"testing"
)

// Every genre badge style must render distinctly. glass, square, pill and clean
// once shared the default frosted path and produced byte-identical output; this
// guard fails if any two styles collapse together. A tile colour is set so the
// tile style, which only fills when given one, is exercised as it is in use.
func TestGenreBadgeStylesRenderDistinctly(t *testing.T) {
	styles := []string{"", "glass", "pill", "square", "plain", "clean", "tile"}
	genres := []string{"Action", "Drama"}

	label := func(s string) string {
		if s == "" {
			return "default"
		}
		return s
	}

	renders := make(map[string]*image.NRGBA, len(styles))
	for _, s := range styles {
		img := genreTestImage()
		drawGenreBadge(img, genres, "bl", 1.0, newOccupancy(img.Bounds()),
			genreBadgeOpts{style: s, tileColor: "#3355ff"})
		renders[s] = img
	}

	for i := 0; i < len(styles); i++ {
		for j := i + 1; j < len(styles); j++ {
			if !imagesDiffer(renders[styles[i]], renders[styles[j]]) {
				t.Errorf("genre styles %q and %q render identically", label(styles[i]), label(styles[j]))
			}
		}
	}
}
