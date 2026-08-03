package compose

import (
	"bytes"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// The accent stripe draws only on the styles whose corners are square enough for
// it — tile and square. Hiding it must change those and leave the fully-rounded
// styles, which never drew one, untouched.
func TestHidingTheRatingAccentStripe(t *testing.T) {
	if testing.Short() {
		t.Skip("render sweep: skipped under -short, runs in the ordinary test pass")
	}
	p := effectPipeline()
	draws := map[imageconfig.BadgeStyle]bool{
		imageconfig.BadgeTile:   true,
		imageconfig.BadgeSquare: true,
		imageconfig.BadgePill:   false,
		imageconfig.BadgeGlass:  false,
	}
	for style, hasStripe := range draws {
		shown := maximalConfig()
		shown.BadgeStyle = style
		hidden := shown
		hidden.RatingAccentBarHidden = true
		a := renderOne(t, p, shown, "movie", "poster")
		b := renderOne(t, p, hidden, "movie", "poster")
		changed := !bytes.Equal(a, b)
		if changed != hasStripe {
			t.Errorf("style %s: hiding the accent stripe changed the render=%v, expected %v",
				style, changed, hasStripe)
		}
	}
}
