package compose

import (
	"bytes"
	"image"
	"image/png"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

func rowMean(img *image.NRGBA, y int) float64 {
	b := img.Bounds()
	sum := 0
	for x := b.Min.X; x < b.Max.X; x++ {
		p := img.NRGBAAt(x, y)
		sum += int(p.R) + int(p.G) + int(p.B)
	}
	return float64(sum) / float64(b.Dx()*3)
}

func rowRoughness(img *image.NRGBA, y0, y1 int) float64 {
	sum, n := 0, 0
	for y := y0; y < y1; y++ {
		for x := 0; x+1 < img.Bounds().Dx(); x++ {
			d := int(img.NRGBAAt(x, y).R) - int(img.NRGBAAt(x+1, y).R)
			if d < 0 {
				d = -d
			}
			sum += d
			n++
		}
	}
	return float64(sum) / float64(n)
}

func rowsEqual(a, b *image.NRGBA, y0, y1 int) bool {
	return bytes.Equal(a.Pix[y0*a.Stride:y1*a.Stride], b.Pix[y0*b.Stride:y1*b.Stride])
}

func TestBottomLookOffChangesNothing(t *testing.T) {
	orig := noiseImage(300, 450)
	got := cloneNRGBA(orig)
	drawBottomLook(got, bottomLookOpts{})
	if !bytes.Equal(orig.Pix, got.Pix) {
		t.Error("an unset bottom look changed pixels")
	}
	if bottomLookFromConfig(imageconfig.Config{}) != (bottomLookOpts{}) {
		t.Error("an empty config produced a bottom look")
	}
}

func TestBottomFadeDarkensTheBandAndLeavesTheTop(t *testing.T) {
	orig := noiseImage(300, 450)
	got := cloneNRGBA(orig)
	drawBottomLook(got, bottomLookOpts{fadeHeight: 40, fadeOpacity: 100})
	band := 450 * 40 / 100
	if !rowsEqual(orig, got, 0, 450-band) {
		t.Error("the fade changed rows above its band")
	}
	if rowMean(got, 449) > rowMean(orig, 449)*0.1 {
		t.Errorf("the bottom row is %.1f, want it nearly black from %.1f", rowMean(got, 449), rowMean(orig, 449))
	}
	if !(rowMean(got, 449) < rowMean(got, 450-band/2) && rowMean(got, 450-band/2) < rowMean(orig, 450-band/2)) {
		t.Error("the fade does not deepen towards the bottom edge")
	}
}

func TestBottomFadeColourAndOpacity(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 40, 100))
	for i := range img.Pix {
		img.Pix[i] = 255
	}
	drawBottomFade(img, 50, 100, "#ff0000")
	if p := img.NRGBAAt(5, 99); p.R < 250 || p.G > 20 || p.B > 20 {
		t.Errorf("bottom pixel %v, want red", p)
	}
	half := image.NewNRGBA(img.Bounds())
	for i := range half.Pix {
		half.Pix[i] = 255
	}
	drawBottomFade(half, 50, 50, "")
	if p := half.NRGBAAt(5, 99); p.R < 110 || p.R > 150 {
		t.Errorf("half-opacity black over white gave %v, want about 128", p)
	}
}

func TestBottomBlurSoftensTheBandAndEasesIn(t *testing.T) {
	orig := noiseImage(400, 600)
	got := cloneNRGBA(orig)
	drawBottomLook(got, bottomLookOpts{blurHeight: 30, blurStrength: 80})
	band := 600 * 30 / 100
	top := 600 - band
	if !rowsEqual(orig, got, 0, top) {
		t.Error("the blur changed rows above its band")
	}
	if got, want := rowRoughness(got, 590, 600), rowRoughness(orig, 590, 600); got > want/3 {
		t.Errorf("bottom roughness %.1f against %.1f unblurred, want far lower", got, want)
	}
	// No hard edge: the first rows of the band stay close to the sharp art.
	first, last := 0, 0
	for x := 0; x < 400; x++ {
		first += absDiff(orig.NRGBAAt(x, top+1).R, got.NRGBAAt(x, top+1).R)
		last += absDiff(orig.NRGBAAt(x, 598).R, got.NRGBAAt(x, 598).R)
	}
	if first*4 > last {
		t.Errorf("blur enters abruptly: row diff %d at the top of the band against %d at the bottom", first, last)
	}
}

func absDiff(a, b uint8) int {
	if a > b {
		return int(a - b)
	}
	return int(b - a)
}

func TestBottomFadeAndBlurCombine(t *testing.T) {
	orig := noiseImage(300, 450)
	fade := cloneNRGBA(orig)
	drawBottomLook(fade, bottomLookOpts{fadeHeight: 30, fadeOpacity: 40})
	both := cloneNRGBA(orig)
	drawBottomLook(both, bottomLookOpts{fadeHeight: 30, fadeOpacity: 40, blurHeight: 30})
	if rowRoughness(both, 430, 450) >= rowRoughness(fade, 430, 450) {
		t.Error("adding the blur did not soften the faded band")
	}
}

func TestLogoBottomMarginPinsTheLowerEdge(t *testing.T) {
	logo := logoPNG(t)
	for _, tc := range []struct {
		name string
		opts logoOverlayOpts
	}{
		{"with a bottom anchor", logoOverlayOpts{anchor: "bottom", posPercent: 40, bottomMargin: 5}},
		{"without one, over the ratings reserve", logoOverlayOpts{posPercent: 40, bottomMargin: 5}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			base := posterCanvas()
			drawBackdropLogoOverlay(base, logo, 120, tc.opts)
			box, ok := drawnBox(base)
			if !ok {
				t.Fatal("no logo drawn")
			}
			if want := 600 - 30; box.Max.Y != want {
				t.Errorf("lower edge at row %d, want %d (5%% of 600 above the bottom)", box.Max.Y, want)
			}
		})
	}
	base := posterCanvas()
	drawBackdropLogoOverlay(base, logo, 120, logoOverlayOpts{anchor: "bottom", posPercent: 40})
	if box, _ := drawnBox(base); box.Max.Y > 600-120-16 {
		t.Errorf("without a margin the logo should stay above the reserve, got %v", box)
	}
}

func TestLogoBoundingBoxFitsBothLimitsKeepingAspect(t *testing.T) {
	mk := func(w, h int) []byte {
		img := image.NewNRGBA(image.Rect(0, 0, w, h))
		for i := range img.Pix {
			img.Pix[i] = 255
		}
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err != nil {
			t.Fatal(err)
		}
		return buf.Bytes()
	}
	opts := logoOverlayOpts{widthPercent: 50, heightPercent: 15}
	for _, tc := range []struct {
		name string
		w, h int
	}{{"wide", 600, 100}, {"tall", 100, 400}} {
		base := posterCanvas()
		drawBackdropLogoOverlay(base, mk(tc.w, tc.h), 0, opts)
		box, ok := drawnBox(base)
		if !ok {
			t.Fatalf("%s: no logo drawn", tc.name)
		}
		if box.Dx() > 200+1 || box.Dy() > 90+1 {
			t.Errorf("%s: drawn %v exceeds the 200x90 box", tc.name, box)
		}
		if got, want := float64(box.Dx())/float64(box.Dy()), float64(tc.w)/float64(tc.h); got < want*0.93 || got > want*1.07 {
			t.Errorf("%s: aspect %.2f, want %.2f", tc.name, got, want)
		}
	}
}

// A badge in the bottom band must sit over the fade, not under it.
func TestBadgesSitOnTopOfTheBottomFade(t *testing.T) {
	cfg := frostBareConfig()
	cfg.Ratings = []string{"imdb", "tmdb"}
	cfg.RatingsLayout = imageconfig.LayoutBottom
	cfg.RatingPresentation = ""
	cfg.BottomFadeHeight = 100
	cfg.BottomFadeOpacity = 100
	p := effectPipeline()
	withBadges := renderPosterImage(t, p, cfg, "poster")
	cfg.Ratings = nil
	cfg.RatingsLayout = imageconfig.LayoutNone
	cfg.RatingPresentation = "none"
	fadeOnly := renderPosterImage(t, p, cfg, "poster")

	h := withBadges.Bounds().Dy()
	bright := func(img *image.NRGBA) int {
		peak := 0
		for y := h * 9 / 10; y < h; y++ {
			for x := 0; x < img.Bounds().Dx(); x++ {
				c := img.NRGBAAt(x, y)
				if v := int(c.R); v > peak {
					peak = v
				}
			}
		}
		return peak
	}
	if got := bright(fadeOnly); got > 20 {
		t.Fatalf("the faded foot is not near black (peak %d), the fixture does not prove ordering", got)
	}
	if got := bright(withBadges); got < 100 {
		t.Errorf("badges in the faded band peak at %d, want them drawn over the fade", got)
	}
}

func TestBottomLookDoesNotTouchTheLogoSurface(t *testing.T) {
	cfg := frostBareConfig()
	p := effectPipeline()
	plain := renderPosterImage(t, p, cfg, "logo")
	cfg.BottomFadeHeight = 50
	cfg.BottomBlurHeight = 50
	if n, _ := differs(plain, renderPosterImage(t, p, cfg, "logo")); n != 0 {
		t.Errorf("the logo surface changed by %d pixels", n)
	}
}
