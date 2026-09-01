package compose

import (
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// The config says shadows on and the opts field says no shadow, so the two are
// inverted where they meet. Both defaults produce the same picture — shadows
// drawn — which means a sign error in the wiring is invisible until someone
// turns the switch off. Asserting only that on and off differ passes under an
// inversion, because inverted still differs. So the off case has to assert the
// background is untouched, which a build where off means on cannot satisfy.
//
// The background is 232 rather than a neutral grey, matching tile_shadow_test:
// the genre badge draws its shadow at alpha 46, and a black shadow at that alpha
// over a level B lands at B*0.82. On 232 that is a drop of 42 levels; on a dark
// background it is 6, which is inside the noise of anything that resamples.
const shadowProbeBG = 232

func flatBG(w, h int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.SetNRGBA(x, y, color.NRGBA{R: shadowProbeBG, G: shadowProbeBG, B: shadowProbeBG, A: 255})
		}
	}
	return img
}

// darkestBelow reports the lowest red level found under the tile, where the
// shadow lands.
func darkestBelow(img *image.NRGBA, r image.Rectangle) uint8 {
	lowest := uint8(255)
	for y := r.Max.Y; y < img.Bounds().Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			if v := img.NRGBAAt(x, y).R; v < lowest {
				lowest = v
			}
		}
	}
	return lowest
}

// Every badge funnels its drop shadow through drawTileShadow, so the toggle is
// the colour reaching that call. Two of the five sites build it inline, which is
// why each is driven separately rather than trusting one render to stand for
// all of them.
func TestBadgeShadowsAreDrawnAndCanBeTurnedOff(t *testing.T) {
	const w, h = 120, 80
	tile := image.Rect(20, 20, 100, 50)

	for _, c := range []struct {
		name string
		draw func(img *image.NRGBA, off bool)
	}{
		{"soft tile", func(img *image.NRGBA, off bool) {
			drawSoftTile(img, tile, 6, tileChrome{
				fill:     color.NRGBA{R: 20, G: 20, B: 24, A: 255},
				shadow:   color.NRGBA{A: 90},
				noShadow: off,
			})
		}},
		// The weakest of the five, and the reporter's own badge.
		{"genre tile at alpha 46", func(img *image.NRGBA, off bool) {
			if !off {
				drawTileShadow(img, tile, 6, color.NRGBA{A: 46})
			}
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			on := flatBG(w, h)
			c.draw(on, false)
			lit := darkestBelow(on, tile)
			if lit >= shadowProbeBG {
				t.Fatalf("control: nothing darkened below the tile with shadows on (%d), so the off case proves nothing", lit)
			}
			if drop := int(shadowProbeBG) - int(lit); drop < 10 {
				t.Errorf("shadow only moved the background %d levels, too little to assert against", drop)
			}

			off := flatBG(w, h)
			c.draw(off, true)
			if got := darkestBelow(off, tile); got != shadowProbeBG {
				t.Errorf("with shadows off the background below the tile is %d, want %d untouched", got, shadowProbeBG)
			}
		})
	}
}

// The config key is the on state and the opts field is the off state, so the
// constructors invert. A sign error there draws shadows when they are switched
// off and none when they are on, which no render of the default config reveals.
func TestTheConfigKeyReachesTheDrawersWithTheRightSign(t *testing.T) {
	shadowOn, shadowOff := imageconfig.Default(), imageconfig.Default()
	shadowOn.BadgeShadow, shadowOff.BadgeShadow = true, false

	for _, c := range []struct {
		name string
		on   bool
		off  bool
	}{
		{"genre", genreOptsFromConfig(shadowOn, false, "movie").noShadow, genreOptsFromConfig(shadowOff, false, "movie").noShadow},
		{"provider", providerOptsFromConfig(shadowOn).noShadow, providerOptsFromConfig(shadowOff).noShadow},
		{"quality", qualityOptsFromConfig(shadowOn).noShadow, qualityOptsFromConfig(shadowOff).noShadow},
		{"age rating", ageOptsFromConfig(shadowOn).noShadow, ageOptsFromConfig(shadowOff).noShadow},
		{"release status", releaseStatusOptsFromConfig(shadowOn).noShadow, releaseStatusOptsFromConfig(shadowOff).noShadow},
		{"top rated", topRatedOptsFromConfig(shadowOn).noShadow, topRatedOptsFromConfig(shadowOff).noShadow},
		{"trending", trendingOptsFromConfig(shadowOn).noShadow, trendingOptsFromConfig(shadowOff).noShadow},
	} {
		t.Run(c.name, func(t *testing.T) {
			if c.on {
				t.Errorf("badgeShadow on produced noShadow=true, so the sign is inverted")
			}
			if !c.off {
				t.Errorf("badgeShadow off produced noShadow=false, so the switch does nothing")
			}
		})
	}
}
