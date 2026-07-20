package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

func genreTestImage() *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
	return img
}

func imagesDiffer(a, b *image.NRGBA) bool {
	if len(a.Pix) != len(b.Pix) {
		return true
	}
	for i := range a.Pix {
		if a.Pix[i] != b.Pix[i] {
			return true
		}
	}
	return false
}

// An offset must move the badge; a scale must resize it; a background opacity
// must change its fill — each observable as a different rendered image.
func TestGenreBadgeOptsChangeRender(t *testing.T) {
	genres := []string{"Action", "Drama"}

	base := genreTestImage()
	drawGenreBadge(base, genres, "bl", 1.0, newOccupancy(base.Bounds()), genreBadgeOpts{})

	cases := map[string]genreBadgeOpts{
		"offset":  {offsetX: 40, offsetY: -30},
		"scale":   {scalePercent: 180},
		"opacity": {bgOpacity: 40},
	}
	for name, opts := range cases {
		img := genreTestImage()
		drawGenreBadge(img, genres, "bl", 1.0, newOccupancy(img.Bounds()), opts)
		if !imagesDiffer(base, img) {
			t.Errorf("%s opts did not change the rendered badge", name)
		}
	}
}

// genreOptsFromConfig must map the config fields through unchanged.
func TestGenreOptsFromConfig(t *testing.T) {
	cfg := imageconfig.Parse([]byte(`{"genreBadgeScale":150,"genreBadgeOffsetX":10,"genreBadgeOffsetY":-5,"genreBadgeBackgroundOpacity":60}`))
	opts := genreOptsFromConfig(cfg)
	if opts.scalePercent != 150 || opts.offsetX != 10 || opts.offsetY != -5 || opts.bgOpacity != 60 {
		t.Errorf("opts mismatch: %+v", opts)
	}
}
