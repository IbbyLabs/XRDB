package compose

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// A wide, opaque logo, so its drawn box is easy to measure.
func logoPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 300, 100))
	for i := range img.Pix {
		img.Pix[i] = 255
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func posterCanvas() *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = 10, 10, 12, 255
	}
	return img
}

// drawnBox returns the bounds of the near-white logo pixels, which the dark
// canvas and the grey scrim never reach.
func drawnBox(img *image.NRGBA) (image.Rectangle, bool) {
	minX, minY, maxX, maxY := 1<<30, 1<<30, -1, -1
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			p := img.NRGBAAt(x, y)
			if p.R > 230 && p.G > 230 && p.B > 230 {
				if x < minX {
					minX = x
				}
				if y < minY {
					minY = y
				}
				if x > maxX {
					maxX = x
				}
				if y > maxY {
					maxY = y
				}
			}
		}
	}
	if maxX < 0 {
		return image.Rectangle{}, false
	}
	return image.Rect(minX, minY, maxX+1, maxY+1), true
}

func drawLogo(opts logoOverlayOpts, t *testing.T) image.Rectangle {
	t.Helper()
	img := posterCanvas()
	drawBackdropLogoOverlay(img, logoPNG(t), 0, opts)
	box, ok := drawnBox(img)
	if !ok {
		t.Fatal("no logo was drawn")
	}
	return box
}

// The box and placement were three constants in the drawing code, so nothing a
// config said could reach them.
func TestTheLogoOverlayTakesItsBoxAndPlacementFromConfig(t *testing.T) {
	base := drawLogo(logoOverlayOpts{}, t)

	wider := drawLogo(logoOverlayOpts{widthPercent: 90}, t)
	if wider.Dx() <= base.Dx() {
		t.Errorf("a wider box did not widen the logo: %d then %d", base.Dx(), wider.Dx())
	}

	shorter := drawLogo(logoOverlayOpts{heightPercent: 8}, t)
	if shorter.Dy() >= base.Dy() {
		t.Errorf("a shorter box did not shrink the logo: %d then %d", base.Dy(), shorter.Dy())
	}

	higher := drawLogo(logoOverlayOpts{posPercent: 20}, t)
	if higher.Min.Y >= base.Min.Y {
		t.Errorf("a higher position did not move the logo up: y=%d then %d", base.Min.Y, higher.Min.Y)
	}
}

// The position is the logo's centre, so resizing must not also move it. That is
// what makes the two sliders independent rather than fighting each other.
func TestResizingTheLogoKeepsItsCentre(t *testing.T) {
	small := drawLogo(logoOverlayOpts{widthPercent: 40, posPercent: 50}, t)
	large := drawLogo(logoOverlayOpts{widthPercent: 80, posPercent: 50}, t)

	centre := func(r image.Rectangle) int { return r.Min.Y + r.Dy()/2 }
	if diff := centre(small) - centre(large); diff > 3 || diff < -3 {
		t.Errorf("resizing moved the centre by %dpx", diff)
	}
}

// A bottom anchor pins the lower edge instead, so a growing logo expands upward
// and stays clear of whatever sits below it.
func TestABottomAnchoredLogoGrowsUpward(t *testing.T) {
	small := drawLogo(logoOverlayOpts{widthPercent: 40, posPercent: 60, anchor: "bottom"}, t)
	large := drawLogo(logoOverlayOpts{widthPercent: 80, posPercent: 60, anchor: "bottom"}, t)

	if diff := small.Max.Y - large.Max.Y; diff > 3 || diff < -3 {
		t.Errorf("the bottom edge moved by %dpx under a bottom anchor", diff)
	}
	if large.Min.Y >= small.Min.Y {
		t.Error("a larger bottom-anchored logo did not grow upward")
	}
}

// Unset config keeps the original look, so nobody's poster changes.
func TestAnUnsetLogoConfigKeepsTheBuiltInLook(t *testing.T) {
	got := logoOptsFromConfig(imageconfig.Config{})
	if got != (logoOverlayOpts{}) {
		t.Errorf("an empty config produced %+v, want the zero value", got)
	}
}

// The controls arrive through the config URL, so they have to parse and clamp.
func TestLogoControlsParseAndClamp(t *testing.T) {
	cfg := imageconfig.Parse([]byte(`{"logoWidth":75,"logoHeight":25,"logoPos":28,"logoAnchor":"bottom"}`))
	if cfg.LogoWidth != 75 || cfg.LogoHeight != 25 || cfg.LogoPos != 28 || cfg.LogoAnchor != "bottom" {
		t.Errorf("logo controls did not parse: %+v", logoOptsFromConfig(cfg))
	}
	if w := imageconfig.Parse([]byte(`{"logoWidth":900}`)).LogoWidth; w != 100 {
		t.Errorf("width clamped to %d, want 100", w)
	}
	if a := imageconfig.Parse([]byte(`{"logoAnchor":"sideways"}`)).LogoAnchor; a != "" {
		t.Errorf("an unknown anchor survived as %q", a)
	}
	// "centre" and "center" both mean the default, and neither is stored.
	for _, spelling := range []string{"center", "centre"} {
		if a := imageconfig.Parse([]byte(`{"logoAnchor":"` + spelling + `"}`)).LogoAnchor; a != "" {
			t.Errorf("%s stored as %q, want the default", spelling, a)
		}
	}
	_ = color.NRGBA{}
}
