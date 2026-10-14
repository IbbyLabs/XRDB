package compose

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"sync"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// noiseImage is a busy opaque image, so a blur changes nearly every pixel.
func noiseImage(w, h int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			v := uint32(x)*2654435761 ^ uint32(y)*2246822519 ^ 0x9e3779b9
			img.SetNRGBA(x, y, color.NRGBA{R: uint8(v >> 3), G: uint8(v >> 11), B: uint8(v >> 19), A: 255})
		}
	}
	return img
}

func cloneNRGBA(src *image.NRGBA) *image.NRGBA {
	dst := image.NewNRGBA(src.Bounds())
	copy(dst.Pix, src.Pix)
	return dst
}

func sameNRGBA(a, b *image.NRGBA, x, y int) bool {
	return a.NRGBAAt(x, y) == b.NRGBAAt(x, y)
}

func TestFrostBlursInsideTheRectAndNothingOutside(t *testing.T) {
	orig := noiseImage(300, 300)
	got := cloneNRGBA(orig)
	r := image.Rect(60, 80, 220, 160)
	frostRoundedRect(got, r, 20, squareNone, 100)

	changedInside := 0
	for y := 0; y < 300; y++ {
		for x := 0; x < 300; x++ {
			if !(image.Point{X: x, Y: y}).In(r) {
				if !sameNRGBA(orig, got, x, y) {
					t.Fatalf("pixel (%d,%d) outside the rect changed", x, y)
				}
				continue
			}
			if !sameNRGBA(orig, got, x, y) {
				changedInside++
			}
		}
	}
	if total := r.Dx() * r.Dy(); changedInside < total*9/10 {
		t.Errorf("only %d of %d pixels inside the rect changed", changedInside, total)
	}
}

func TestFrostFollowsTheRoundedCorner(t *testing.T) {
	orig := noiseImage(200, 200)
	got := cloneNRGBA(orig)
	r := image.Rect(40, 40, 160, 120)
	frostRoundedRect(got, r, 30, squareNone, 100)
	if !sameNRGBA(orig, got, r.Min.X, r.Min.Y) {
		t.Error("the extreme corner pixel, outside the arc, was blurred")
	}
	if !sameNRGBA(orig, got, r.Max.X-1, r.Max.Y-1) {
		t.Error("the opposite corner pixel, outside the arc, was blurred")
	}
	if sameNRGBA(orig, got, r.Min.X+30, r.Min.Y+30) {
		t.Error("a pixel well inside the arc was left sharp")
	}
}

func TestFrostSquaredCornersAreBlurredToTheEdge(t *testing.T) {
	orig := noiseImage(200, 200)
	got := cloneNRGBA(orig)
	r := image.Rect(40, 0, 160, 60)
	frostRoundedRect(got, r, 24, squareTop, 100)
	if sameNRGBA(orig, got, r.Min.X, r.Min.Y) {
		t.Error("the squared top corner stayed sharp")
	}
}

func TestFrostOffChangesNothing(t *testing.T) {
	orig := noiseImage(120, 120)
	got := cloneNRGBA(orig)
	frostRoundedRect(got, image.Rect(10, 10, 100, 100), 10, squareNone, 0)
	frostFeatheredRect(got, image.Rect(10, 10, 100, 100), 6, 0)
	if !bytes.Equal(orig.Pix, got.Pix) {
		t.Error("strength 0 altered the image")
	}
}

func TestFrostHandlesRectsPastTheEdgeAndEmptyOnes(t *testing.T) {
	got := noiseImage(80, 80)
	frostRoundedRect(got, image.Rect(-20, -20, 40, 40), 8, squareNone, 100)
	frostRoundedRect(got, image.Rect(60, 60, 200, 200), 8, squareNone, 100)
	frostRoundedRect(got, image.Rect(500, 500, 600, 600), 8, squareNone, 100)
	frostRoundedRect(got, image.Rectangle{}, 8, squareNone, 100)
}

func TestFrostStrengthSoftensMore(t *testing.T) {
	roughness := func(strength int) int {
		img := noiseImage(300, 300)
		frostRoundedRect(img, image.Rect(20, 20, 280, 280), 0, squareNone, strength)
		sum := 0
		for y := 100; y < 200; y++ {
			for x := 100; x < 200; x++ {
				a, b := img.NRGBAAt(x, y), img.NRGBAAt(x+1, y)
				d := int(a.R) - int(b.R)
				if d < 0 {
					d = -d
				}
				sum += d
			}
		}
		return sum
	}
	low, high := roughness(10), roughness(100)
	if high >= low {
		t.Errorf("strength 100 left the area rougher (%d) than strength 10 (%d)", high, low)
	}
}

func TestFrostRadiusScalesWithTheFrame(t *testing.T) {
	if frostRadius(0, 1000) != 0 || frostRadius(-5, 1000) != 0 {
		t.Error("a non-positive strength must be off")
	}
	if frostRadius(1, 100) < 1 {
		t.Error("any positive strength blurs by at least a pixel")
	}
	if frostRadius(500, 1000) != frostRadius(100, 1000) {
		t.Error("strength past 100 must clamp")
	}
	one, big := frostRadius(80, 780), frostRadius(80, 2340)
	if ratio := float64(big) / float64(one); ratio < 2.7 || ratio > 3.3 {
		t.Errorf("a 3x frame blurred %dpx against %dpx, ratio %.2f, want about 3", big, one, ratio)
	}
}

func TestFrostFeatheredRectFadesOutward(t *testing.T) {
	orig := noiseImage(300, 300)
	got := cloneNRGBA(orig)
	r := image.Rect(100, 100, 200, 160)
	frostFeatheredRect(got, r, 12, 100)
	outer := r.Inset(-12)
	for y := 0; y < 300; y++ {
		for x := 0; x < 300; x++ {
			if !(image.Point{X: x, Y: y}).In(outer) && !sameNRGBA(orig, got, x, y) {
				t.Fatalf("pixel (%d,%d) beyond the feather changed", x, y)
			}
		}
	}
	if sameNRGBA(orig, got, 150, 130) {
		t.Error("the middle of the panel stayed sharp")
	}
}

// ── Full renders ─────────────────────────────────────────────────────────────

func renderPosterImage(t testing.TB, p *Pipeline, cfg imageconfig.Config, surface string) *image.NRGBA {
	t.Helper()
	res, err := p.Render(context.Background(), Request{
		MediaType: surface, ContentType: "movie", MediaID: "tt1375666", Config: cfg,
	})
	if err != nil {
		t.Fatalf("render %s: %v", surface, err)
	}
	if res.Placeholder {
		t.Fatalf("render %s produced a placeholder", surface)
	}
	img, err := png.Decode(bytes.NewReader(res.ImageBytes))
	if err != nil {
		t.Fatalf("decode %s: %v", surface, err)
	}
	out := image.NewNRGBA(img.Bounds())
	for y := out.Bounds().Min.Y; y < out.Bounds().Max.Y; y++ {
		for x := out.Bounds().Min.X; x < out.Bounds().Max.X; x++ {
			out.Set(x, y, img.At(x, y))
		}
	}
	return out
}

// frostBareConfig is the maximal config with every overlay switched off, so a
// case turns on exactly one badge family and the difference from the bare
// render is that family's footprint.
func frostBareConfig() imageconfig.Config {
	c := maximalConfig()
	c.Ratings = nil
	c.RatingsLayout = imageconfig.LayoutNone
	c.RatingPresentation = "none"
	c.Badges = nil
	c.AgeRating = false
	c.ReleaseStatus = false
	c.TopRated = false
	c.Awards = false
	c.Stinger = false
	c.Genre = false
	c.Providers = false
	c.MetaLine = false
	c.AggregateBar = false
	c.Trending = false
	c.RatingRing = false
	c.BackdropLogo = false
	return c
}

func differs(a, b *image.NRGBA) (count int, bounds image.Rectangle) {
	for y := a.Bounds().Min.Y; y < a.Bounds().Max.Y; y++ {
		for x := a.Bounds().Min.X; x < a.Bounds().Max.X; x++ {
			if !sameNRGBA(a, b, x, y) {
				count++
				bounds = bounds.Union(image.Rect(x, y, x+1, y+1))
			}
		}
	}
	return count, bounds
}

type frostCase struct {
	name string
	set  func(*imageconfig.Config)
	// surface is a style with a panel to blur behind; false for the styles that
	// draw text straight on the artwork.
	frosts bool
}

func frostCases() []frostCase {
	strip := func(style imageconfig.BadgeStyle, frosts bool) frostCase {
		return frostCase{"rating strip " + string(style), func(c *imageconfig.Config) {
			c.Ratings = []string{"imdb", "tmdb", "rt", "metacritic", "letterboxd", "trakt", "mal"}
			c.RatingsLayout = imageconfig.LayoutBottom
			c.RatingPresentation = ""
			c.BadgeStyle = style
		}, frosts}
	}
	genre := func(style string, frosts bool) frostCase {
		return frostCase{"genre " + style, func(c *imageconfig.Config) {
			c.Genre = true
			c.GenreBadgeStyle = style
		}, frosts}
	}
	age := func(style string, frosts bool) frostCase {
		return frostCase{"age rating " + style, func(c *imageconfig.Config) {
			c.AgeRating = true
			c.AgeRatingBadgeStyle = style
		}, frosts}
	}
	return []frostCase{
		strip(imageconfig.BadgePill, true),
		strip(imageconfig.BadgeSquare, true),
		strip(imageconfig.BadgeGlass, true),
		strip(imageconfig.BadgeTile, true),
		strip(imageconfig.BadgeStacked, true),
		strip(imageconfig.BadgePlain, false),
		{"rating strip anchored", func(c *imageconfig.Config) {
			c.Ratings = []string{"imdb", "tmdb", "rt"}
			c.RatingsLayout = imageconfig.LayoutBottom
			c.RatingPresentation = ""
			c.RatingsAnchored = true
		}, true},
		genre("", true), genre("glass", true), genre("pill", true), genre("square", true), genre("tile", true),
		genre("plain", false), genre("clean", false),
		age("", true), age("glass", true), age("square", true), age("tile", true),
		{"quality badges", func(c *imageconfig.Config) { c.Badges = []string{"4k", "hdr", "dv"} }, true},
		{"quality glass", func(c *imageconfig.Config) {
			c.Badges = []string{"4k", "hdr", "dv"}
			c.QualityBadgesStyle = "glass"
		}, true},
		{"release status", func(c *imageconfig.Config) { c.ReleaseStatus = true }, true},
		{"top rated", func(c *imageconfig.Config) { c.TopRated = true }, true},
		{"awards", func(c *imageconfig.Config) { c.Awards = true }, true},
		{"stinger", func(c *imageconfig.Config) { c.Stinger = true }, true},
		{"watch providers", func(c *imageconfig.Config) { c.Providers = true }, true},
		{"trending", func(c *imageconfig.Config) { c.Trending = true }, true},
		{"trending rank tab", func(c *imageconfig.Config) {
			c.Trending = true
			c.TrendingRank = true
		}, true},
		{"rating ring", func(c *imageconfig.Config) {
			c.Ratings = []string{"imdb", "tmdb", "rt"}
			c.RatingRing = true
		}, true},
		{"aggregate pills", func(c *imageconfig.Config) {
			c.Ratings = []string{"imdb", "tmdb", "rt", "metacritic"}
			c.RatingPresentation = "dual"
		}, true},
		{"meta line age chip", func(c *imageconfig.Config) {
			c.MetaLine = true
			c.MetaLineAgeRating = true
		}, true},
	}
}

// With frost on, a render differs from the same render without it only inside
// the badge's own footprint, and does differ wherever the style has a panel.
func TestFrostedRenderChangesOnlyTheBadgeRegions(t *testing.T) {
	p := effectPipeline()
	bare := renderPosterImage(t, p, frostBareConfig(), "poster")
	for _, tc := range frostCases() {
		t.Run(tc.name, func(t *testing.T) {
			cfg := frostBareConfig()
			tc.set(&cfg)
			plain := renderPosterImage(t, p, cfg, "poster")
			footprint, fbox := differs(plain, bare)
			if footprint == 0 {
				t.Fatal("control: the badge drew nothing, so the case proves nothing")
			}
			cfg.BadgeFrost = 80
			frosted := renderPosterImage(t, p, cfg, "poster")

			changed := 0
			for y := 0; y < plain.Bounds().Dy(); y++ {
				for x := 0; x < plain.Bounds().Dx(); x++ {
					if sameNRGBA(plain, frosted, x, y) {
						continue
					}
					changed++
					// The glass strip's panel has no fill, so its footprint is only the
					// outline and the check falls back to the row's bounding box.
					if tc.name == "rating strip glass" {
						if !(image.Point{X: x, Y: y}).In(fbox.Inset(-2)) {
							t.Fatalf("pixel (%d,%d) changed outside the badge row %v", x, y, fbox)
						}
						continue
					}
					if !nearFootprint(plain, bare, x, y, 2) {
						t.Fatalf("pixel (%d,%d) changed outside the badge footprint", x, y)
					}
				}
			}
			if tc.frosts && changed == 0 {
				t.Error("frost changed no pixel, so the badge drew its panel over sharp artwork")
			}
			if !tc.frosts && changed != 0 {
				t.Errorf("a style with no panel changed %d pixels", changed)
			}
		})
	}
}

func nearFootprint(a, b *image.NRGBA, x, y, d int) bool {
	for dy := -d; dy <= d; dy++ {
		for dx := -d; dx <= d; dx++ {
			px, py := x+dx, y+dy
			if !(image.Point{X: px, Y: py}).In(a.Bounds()) {
				continue
			}
			if !sameNRGBA(a, b, px, py) {
				return true
			}
		}
	}
	return false
}

func TestFrostAtZeroIsTheUnfrostedRender(t *testing.T) {
	p := effectPipeline()
	cfg := maximalConfig()
	a := renderPosterImage(t, p, cfg, "poster")
	cfg.BadgeFrost = 0
	cfg.LogoFrost = false
	b := renderPosterImage(t, p, cfg, "poster")
	if n, _ := differs(a, b); n != 0 {
		t.Errorf("explicit zero changed %d pixels", n)
	}
}

func TestFrostStrengthChangesTheRender(t *testing.T) {
	p := effectPipeline()
	cfg := frostBareConfig()
	cfg.Genre = true
	cfg.BadgeFrost = 20
	weak := renderPosterImage(t, p, cfg, "poster")
	cfg.BadgeFrost = 100
	strong := renderPosterImage(t, p, cfg, "poster")
	if n, _ := differs(weak, strong); n == 0 {
		t.Error("strength 20 and 100 rendered the same")
	}
}

// ── Logo ─────────────────────────────────────────────────────────────────────

func solidLogoPNG(t testing.TB, w, h int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := h / 4; y < h*3/4; y++ {
		for x := w / 6; x < w*5/6; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: 250, G: 250, B: 250, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestLogoFrostOnlyTouchesTheLogoArea(t *testing.T) {
	logo := solidLogoPNG(t, 300, 100)
	orig := noiseImage(1280, 720)

	off := cloneNRGBA(orig)
	drawBackdropLogoOverlay(off, logo, 0, logoOverlayOpts{})
	on := cloneNRGBA(orig)
	drawBackdropLogoOverlay(on, logo, 0, logoOverlayOpts{frost: true})

	n, box := differs(off, on)
	if n == 0 {
		t.Fatal("logo frost changed nothing")
	}
	if box.Dx() > 640 || box.Dy() > 200 {
		t.Errorf("frost spread over %v, far beyond a 432x144 logo", box)
	}
	cx := orig.Bounds().Dx() / 2
	if box.Min.X > cx || box.Max.X < cx {
		t.Errorf("frost %v is not centred on the logo", box)
	}
	for _, pt := range []image.Point{{5, 5}, {1270, 5}, {5, 710}, {1270, 710}, {cx, 5}} {
		if !sameNRGBA(off, on, pt.X, pt.Y) {
			t.Errorf("pixel %v far from the logo changed", pt)
		}
	}
	// The mark itself is drawn on top of the blur, untouched.
	logoImg, _ := decodeImage(logo)
	if logoImg == nil {
		t.Fatal("logo did not decode")
	}
}

func TestLogoFrostIsIndependentOfBadgeFrost(t *testing.T) {
	p := effectPipeline()
	cfg := frostBareConfig()
	cfg.BackdropLogo = true
	cfg.BadgeFrost = 90
	a := renderPosterImage(t, p, cfg, "backdrop")
	b := renderPosterImage(t, p, cfg, "backdrop")
	if n, _ := differs(a, b); n != 0 {
		t.Fatalf("control: render is not deterministic (%d pixels)", n)
	}
	cfg.LogoFrost = true
	c := renderPosterImage(t, p, cfg, "backdrop")
	if n, _ := differs(a, c); n == 0 {
		t.Error("logoFrost changed nothing on a backdrop with a logo")
	}
}

// ── Concurrency ──────────────────────────────────────────────────────────────

func TestFrostedRendersAreRaceFreeAndDeterministic(t *testing.T) {
	p := effectPipeline()
	cfg := maximalConfig()
	cfg.BadgeFrost = 70
	cfg.LogoFrost = true

	want := renderPosterImage(t, p, cfg, "poster")
	wantBackdrop := renderPosterImage(t, p, cfg, "backdrop")

	var wg sync.WaitGroup
	for i := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			surface, ref := "poster", want
			if i%2 == 1 {
				surface, ref = "backdrop", wantBackdrop
			}
			got := renderPosterImage(t, p, cfg, surface)
			if n, _ := differs(ref, got); n != 0 {
				t.Errorf("concurrent %s render differed in %d pixels", surface, n)
			}
		}()
	}
	wg.Wait()
}

// The fast path skips coverage for the span it is given, so the span may never
// include a pixel the shape does not fully cover.
func TestRoundedFullSpanOnlyHoldsFullyCoveredPixels(t *testing.T) {
	for _, sq := range []squaredCorners{squareNone, squareTop, squareBottom, squareLeft, squareRight} {
		for _, r := range []image.Rectangle{
			image.Rect(10, 10, 210, 70), image.Rect(0, 0, 40, 40), image.Rect(5, 5, 25, 90), image.Rect(3, 4, 300, 12),
		} {
			for _, radius := range []int{0, 1, 5, 20, 30, 60} {
				full := roundedFullSpan(r, radius, sq)
				spanned := 0
				for y := r.Min.Y; y < r.Max.Y; y++ {
					x0, x1 := full(y)
					for x := x0; x < x1; x++ {
						spanned++
						if sq != squareNone && onSquaredEdge(x, y, r, radius, sq) {
							continue
						}
						if cov, skip := cornerCoverage(x, y, r, radius); skip || cov < 1 {
							t.Fatalf("sq=%d rect=%v radius=%d: (%d,%d) is in the span but coverage is %v", sq, r, radius, x, y, cov)
						}
					}
				}
				if radius <= 5 && spanned < r.Dx()*r.Dy()*7/10 {
					t.Errorf("sq=%d rect=%v radius=%d: span covers only %d of %d pixels", sq, r, radius, spanned, r.Dx()*r.Dy())
				}
			}
		}
	}
}
