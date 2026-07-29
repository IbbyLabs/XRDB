package compose

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"sync"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

// stubImageFetcher returns a fixed solid-color PNG.
type stubImageFetcher struct {
	data []byte
	err  error
}

func (s *stubImageFetcher) Fetch(_ context.Context, _ string) ([]byte, error) {
	return s.data, s.err
}

func makeTestPNG(w, h int, c color.NRGBA) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: c}, image.Point{}, draw.Src)
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

// makeNoisyPNG builds a high-entropy image. A solid fill compresses to almost
// nothing, so a byte-budget assertion against one proves nothing; this is the
// realistic worst case for JPEG.
func makeNoisyPNG(w, h int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			v := uint32(x*2654435761) ^ uint32(y*2246822519)
			img.SetNRGBA(x, y, color.NRGBA{uint8(v >> 3), uint8(v >> 11), uint8(v >> 19), 255})
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func makeTestJPEG(w, h int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.RGBA{100, 100, 100, 255}}, image.Point{}, draw.Src)
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, img, nil)
	return buf.Bytes()
}

func testRegistry(prov provider.Provider) *provider.Registry {
	reg := provider.NewRegistry()
	reg.Register(prov)
	return reg
}

func TestRenderFallsBackToPlaceholderOnProviderError(t *testing.T) {
	stub := &provider.StubProvider{ProviderName: "tmdb", Err: fmt.Errorf("api down")}
	p := &Pipeline{providers: testRegistry(stub), fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt0816692", Config: imageconfig.Default()}
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(res.ImageBytes, render.PlaceholderPNG("poster")) {
		t.Error("expected fallback placeholder on provider error")
	}
	if !res.Placeholder {
		t.Error("expected Placeholder=true so the caller skips caching and signals no-store")
	}
}

func TestRenderFallsBackOnNoArtworkURL(t *testing.T) {
	stub := &provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{Title: "Test"}}
	p := &Pipeline{providers: testRegistry(stub), fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt0816692", Config: imageconfig.Default()}
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !bytes.Equal(res.ImageBytes, render.PlaceholderPNG("poster")) {
		t.Error("expected fallback placeholder when no artwork URL")
	}
}

// fallbackRatingStub mimics a real rating provider AFTER the surface/content-type
// decouple: it serves a rating for a series, and when given no content-type hint
// it self-resolves (the movie->series fallback the real providers now perform)
// rather than dropping the rating. It records every content-type arg it receives
// so the test can prove the artwork surface never leaks in as a content type.
type fallbackRatingStub struct {
	name string
	mu   sync.Mutex
	seen []string
}

func (s *fallbackRatingStub) Name() string { return s.name }

func (s *fallbackRatingStub) Fetch(_ context.Context, contentType, _ string) (*provider.MediaMeta, error) {
	s.mu.Lock()
	s.seen = append(s.seen, contentType)
	s.mu.Unlock()
	switch contentType {
	case "series", "": // explicit hint, or no hint (provider falls back internally)
		return &provider.MediaMeta{Ratings: []provider.Rating{{Source: s.name, Value: 8.5, Label: "8.5"}}}, nil
	default:
		return nil, fmt.Errorf("%s: not found for %q", s.name, contentType)
	}
}

// TestRatingsMatchAcrossPosterAndBackdrop verifies the fix at the pipeline layer:
// collected ratings depend only on the title's content type, never on the artwork
// surface. It covers both the Stremio path (explicit ?type=series) and the
// configurator/AIOM path (no hint) — the exact scenario from the bug report where
// the poster ring disagreed with the backdrop ring.
func TestRatingsMatchAcrossPosterAndBackdrop(t *testing.T) {
	for _, ct := range []string{"series", ""} {
		stub := &fallbackRatingStub{name: "mdblist"}
		// Default ArtworkSource is tmdb, so the mdblist stub is in the rating
		// fan-out (collectRatingsWithProviders only skips the artwork source).
		p := &Pipeline{providers: testRegistry(stub), fetcher: &stubImageFetcher{}}
		cfg := imageconfig.Default()

		poster := Request{MediaType: "poster", ContentType: ct, MediaID: "tt2250192", Config: cfg}
		backdrop := Request{MediaType: "backdrop", ContentType: ct, MediaID: "tt2250192", Config: cfg}

		pr, _, _ := p.collectRatingsWithProviders(context.Background(), poster, nil)
		br, _, _ := p.collectRatingsWithProviders(context.Background(), backdrop, nil)

		if len(pr) == 0 || len(br) == 0 {
			t.Fatalf("ct=%q: expected ratings on both surfaces, got poster=%d backdrop=%d", ct, len(pr), len(br))
		}
		if !sameRatingSet(pr, br) {
			t.Fatalf("ct=%q: ratings differ across surfaces: poster=%v backdrop=%v", ct, pr, br)
		}
		for _, got := range stub.seen {
			switch got {
			case "poster", "backdrop", "thumbnail", "logo":
				t.Fatalf("ct=%q: provider received artwork surface %q as a content type", ct, got)
			}
		}
	}
}

func sameRatingSet(a, b []provider.Rating) bool {
	if len(a) != len(b) {
		return false
	}
	ma := make(map[string]float64, len(a))
	for _, r := range a {
		ma[r.Source] = r.Value
	}
	for _, r := range b {
		if v, ok := ma[r.Source]; !ok || v != r.Value {
			return false
		}
	}
	return true
}

func TestRenderProducesCorrectDimensions(t *testing.T) {
	srcPNG := makeTestPNG(800, 1200, color.NRGBA{50, 50, 80, 255})
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	}
	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: srcPNG},
	}
	req := Request{
		MediaType: "poster",
		MediaID:   "tt0816692",
		Config:    imageconfig.Default(),
	}
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	img, format, err := image.Decode(bytes.NewReader(res.ImageBytes))
	if err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if format != "jpeg" {
		t.Errorf("poster format = %q, want jpeg", format)
	}
	b := img.Bounds()
	want := render.DeliveryFor("poster", string(imageconfig.Default().Size))
	if b.Dx() != want.Width || b.Dy() != want.Height {
		t.Errorf("got %dx%d, want %dx%d", b.Dx(), b.Dy(), want.Width, want.Height)
	}
}

// A poster must fit Stremio's 100 KB meta limit at the default config, which is
// the whole reason the default tier downsamples on the way out.
func TestDefaultPosterFitsStremioLimit(t *testing.T) {
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	}
	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: makeNoisyPNG(1000, 1500)},
	}
	res, err := p.Render(context.Background(), Request{
		MediaType: "poster", MediaID: "tt1", Config: imageconfig.Default(),
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if res.Placeholder {
		t.Fatal("expected a real render, got a placeholder")
	}
	const stremioMaxBytes = 100 * 1024
	if len(res.ImageBytes) >= stremioMaxBytes {
		t.Errorf("poster is %d bytes, must stay under %d", len(res.ImageBytes), stremioMaxBytes)
	}
	if res.ContentType != "image/jpeg" {
		t.Errorf("ContentType = %q, want image/jpeg", res.ContentType)
	}
}

// A logo carries transparency, so it must stay PNG no matter the tier.
func TestLogoStaysPNG(t *testing.T) {
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", LogoURL: "http://fake/logo.png"},
	}
	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: makeTestPNG(800, 200, color.NRGBA{200, 30, 30, 255})},
	}
	res, err := p.Render(context.Background(), Request{
		MediaType: "logo", MediaID: "tt1", Config: imageconfig.Default(),
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if _, format, err := image.Decode(bytes.NewReader(res.ImageBytes)); err != nil || format != "png" {
		t.Errorf("logo format = %q (err %v), want png", format, err)
	}
}

func TestRenderJPEGSource(t *testing.T) {
	srcJPEG := makeTestJPEG(640, 960)
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{PosterURL: "http://fake/poster.jpg"},
	}
	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: srcJPEG},
	}
	req := Request{MediaType: "poster", MediaID: "tt1", Config: imageconfig.Default()}
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if _, _, err := image.Decode(bytes.NewReader(res.ImageBytes)); err != nil {
		t.Errorf("expected decodable output from a JPEG source: %v", err)
	}
}

func TestResizeFitDimensions(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 1000, 1500))
	out := resizeFit(src, 580, 859)
	b := out.Bounds()
	if b.Dx() != 580 || b.Dy() != 859 {
		t.Errorf("resizeFit: got %dx%d, want 580x859", b.Dx(), b.Dy())
	}
}

func TestBuildCacheKeyDeterministic(t *testing.T) {
	req := Request{MediaType: "poster", MediaID: "tt1", Config: imageconfig.Default()}
	k1 := buildCacheKey(req)
	k2 := buildCacheKey(req)
	if k1 != k2 {
		t.Error("buildCacheKey not deterministic")
	}
}

func TestCollectRatingsMergesProviders(t *testing.T) {
	tmdbStub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL: "http://fake/poster.jpg",
			Ratings: []provider.Rating{
				{Source: "tmdb", Value: 7.5, Label: "7.5"},
			},
		},
	}
	mdbStub := &provider.StubProvider{
		ProviderName: "mdblist",
		Meta: &provider.MediaMeta{
			Ratings: []provider.Rating{
				{Source: "imdb", Value: 8.1, Label: "8.1"},
				{Source: "rt", Value: 9.2, Label: "92%"},
			},
		},
	}

	reg := provider.NewRegistry()
	reg.Register(tmdbStub)
	reg.Register(mdbStub)

	cfg := imageconfig.Default()
	cfg.ArtworkSource = "tmdb"
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt1234567", Config: cfg}

	artwork := &provider.MediaMeta{Ratings: []provider.Rating{{Source: "tmdb", Value: 7.5, Label: "7.5"}}}
	all, _, _ := p.collectRatingsWithProviders(context.Background(), req, artwork)

	bySource := make(map[string]provider.Rating)
	for _, r := range all {
		bySource[r.Source] = r
	}

	if _, ok := bySource["tmdb"]; !ok {
		t.Error("expected tmdb rating from artwork provider")
	}
	if _, ok := bySource["imdb"]; !ok {
		t.Error("expected imdb rating from mdblist provider")
	}
	if _, ok := bySource["rt"]; !ok {
		t.Error("expected rt rating from mdblist provider")
	}
}

func TestCollectRatingsDeduplicatesAcrossProviders(t *testing.T) {
	p1 := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL: "http://fake/poster.jpg",
			Ratings:   []provider.Rating{{Source: "imdb", Value: 7.0, Label: "7.0"}},
		},
	}
	p2 := &provider.StubProvider{
		ProviderName: "mdblist",
		Meta: &provider.MediaMeta{
			Ratings: []provider.Rating{
				{Source: "imdb", Value: 8.0, Label: "8.0"}, // duplicate — first wins
				{Source: "rt", Value: 8.5, Label: "85%"},
			},
		},
	}

	reg := provider.NewRegistry()
	reg.Register(p1)
	reg.Register(p2)

	cfg := imageconfig.Default()
	cfg.ArtworkSource = "tmdb"
	pipe := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt1234567", Config: cfg}

	artwork := &provider.MediaMeta{Ratings: []provider.Rating{{Source: "imdb", Value: 7.0, Label: "7.0"}}}
	all, _, _ := pipe.collectRatingsWithProviders(context.Background(), req, artwork)

	var imdbCount int
	for _, r := range all {
		if r.Source == "imdb" {
			imdbCount++
		}
	}
	if imdbCount != 1 {
		t.Errorf("expected exactly 1 imdb rating, got %d", imdbCount)
	}
}

// TestMDBListRatingsAppearOnPoster verifies that when TMDB provides artwork and
// MDBList provides additional ratings (IMDb, RT, Metacritic, Letterboxd), all
// configured ratings are actually rendered as badges on the output image.
// The test checks that the badge row area contains pixels darker than the solid
// source image, which proves the badge overlay was drawn.
func TestMDBListRatingsAppearOnPoster(t *testing.T) {
	// Solid white source image so any badge pixel will stand out.
	srcPNG := makeTestPNG(580, 859, color.NRGBA{255, 255, 255, 255})

	tmdbStub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL: "http://fake/poster.jpg",
			Ratings: []provider.Rating{
				{Source: "tmdb", Value: 7.5, Label: "7.5"},
			},
		},
	}
	mdbStub := &provider.StubProvider{
		ProviderName: "mdblist",
		Meta: &provider.MediaMeta{
			Ratings: []provider.Rating{
				{Source: "imdb", Value: 7.8, Label: "7.8"},
				{Source: "rt", Value: 9.1, Label: "91%"},
				{Source: "metacritic", Value: 7.4, Label: "74"},
				{Source: "letterboxd", Value: 8.2, Label: "4.1"},
			},
		},
	}

	reg := provider.NewRegistry()
	reg.Register(tmdbStub)
	reg.Register(mdbStub)

	// Inspect pixels on a lossless, full-size render so the assertions test
	// badge drawing rather than the delivery encoding.
	cfg := imageconfig.Default()
	cfg.Size = imageconfig.SizeNormal
	cfg.OutputFormat = imageconfig.OutputPNG
	cfg.ArtworkSource = "tmdb"
	cfg.Ratings = []string{"tmdb", "imdb", "rt", "metacritic", "letterboxd"}

	p := &Pipeline{
		providers: reg,
		fetcher:   &stubImageFetcher{data: srcPNG},
	}
	req := Request{MediaType: "poster", MediaID: "tt0468569", Config: cfg}
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}

	img, err := png.Decode(bytes.NewReader(res.ImageBytes))
	if err != nil {
		t.Fatalf("decode result: %v", err)
	}

	// The badge row sits ~10px from the bottom edge.
	// Sample a horizontal strip in the last 60px and look for dark pixels
	// (badge background is rgba(0,0,0,210)) that prove badges were drawn.
	bounds := img.Bounds()
	sampleY := bounds.Max.Y - 30 // middle of the badge strip
	darkPixels := 0
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		r32, g32, b32, _ := img.At(x, sampleY).RGBA()
		// RGBA() returns 0-65535; a dark pixel has low values
		if r32 < 20000 && g32 < 20000 && b32 < 20000 {
			darkPixels++
		}
	}
	if darkPixels == 0 {
		t.Error("no dark pixels found in badge area — badges were not rendered")
	}

	// Verify correct output dimensions.
	wantDim := render.DimensionsFor("poster")
	if bounds.Dx() != wantDim.Width || bounds.Dy() != wantDim.Height {
		t.Errorf("dimensions: got %dx%d, want %dx%d", bounds.Dx(), bounds.Dy(), wantDim.Width, wantDim.Height)
	}
}

// ── Quality badge tests ─────────────────────────────────────────────────────

func TestQualityBadgesDrawOnImage(t *testing.T) {
	// White canvas — any badge pixel will be non-white.
	img := image.NewNRGBA(image.Rect(0, 0, 580, 859))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)

	got := drawQualityBadges(img, []string{"4k", "hdr", "dv"}, 1.0, newOccupancy(img.Bounds()), qualityBadgeOpts{})
	if got == 0 {
		t.Error("drawQualityBadges returned 0 for non-empty tokens")
	}

	// Quality badges are drawn in the top-right corner.
	// Sample top-right quadrant for any non-white pixel.
	bounds := img.Bounds()
	nonWhite := 0
	for x := bounds.Max.X - 100; x < bounds.Max.X-5; x++ {
		for y := bounds.Min.Y + 5; y < bounds.Min.Y+80; y++ {
			r, g, b, a := img.At(x, y).RGBA()
			if a > 0 && (r < 65535 || g < 65535 || b < 65535) {
				nonWhite++
			}
		}
	}
	if nonWhite == 0 {
		t.Error("no quality badge pixels found in top-right area")
	}
}

func TestQualityBadgesNoopOnEmpty(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 100, 150))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)
	before := clonePixels(img)
	got := drawQualityBadges(img, nil, 1.0, newOccupancy(img.Bounds()), qualityBadgeOpts{})
	after := clonePixels(img)
	if got != 0 {
		t.Errorf("drawQualityBadges returned %d for nil tokens, want 0", got)
	}
	if before != after {
		t.Error("drawQualityBadges with nil tokens must not modify the image")
	}
}

// ── Age rating badge tests ───────────────────────────────────────────────────

func TestAgeRatingBadgeDrawsTL(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 580, 859))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)
	drawAgeRatingBadge(img, "TV-MA", "tl", 1.0, newOccupancy(img.Bounds()), ageRatingOpts{})

	// Top-left corner should have non-white pixels.
	nonWhite := 0
	for x := 5; x < 80; x++ {
		for y := 5; y < 40; y++ {
			r, g, b, a := img.At(x, y).RGBA()
			if a > 0 && (r < 65535 || g < 65535 || b < 65535) {
				nonWhite++
			}
		}
	}
	if nonWhite == 0 {
		t.Error("no age rating badge pixels found in top-left area")
	}
}

func TestAgeRatingBadgeNoopOnEmptyRating(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 100, 150))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{200, 200, 200, 255}}, image.Point{}, draw.Src)
	before := clonePixels(img)
	drawAgeRatingBadge(img, "", "tl", 1.0, newOccupancy(img.Bounds()), ageRatingOpts{})
	after := clonePixels(img)
	if before != after {
		t.Error("drawAgeRatingBadge with empty rating must not modify the image")
	}
}

// ── Minimal / dual presentation tests ────────────────────────────────────────

func presentationRatings() []provider.Rating {
	return []provider.Rating{
		{Source: "imdb", Value: 9.0, Label: "9.0"},
		{Source: "tmdb", Value: 8.5, Label: "8.5"},
		{Source: "rt", Value: 9.4, Label: "94%"}, // critic
	}
}

func TestMinimalRatingDrawsTopPill(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 580, 859))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt"}}
	drawMinimalRating(img, presentationRatings(), nil, false, cfg, 1.0, newOccupancy(img.Bounds()))

	// A centred pill near the top should leave non-white pixels there and none
	// near the bottom (minimal draws a single top pill only).
	if !hasNonWhite(img, 220, 10, 360, 60) {
		t.Error("minimal presentation drew no pill in the top-centre band")
	}
	if hasNonWhite(img, 220, 800, 360, 850) {
		t.Error("minimal presentation should not draw at the bottom")
	}
}

func TestDualRatingDrawsCriticsAndAudience(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 580, 859))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt"}}
	drawDualRating(img, presentationRatings(), nil, false, cfg, 1.0, newOccupancy(img.Bounds()), true)

	if !hasNonWhite(img, 200, 10, 380, 60) {
		t.Error("dual presentation drew no critics pill at the top")
	}
	if !hasNonWhite(img, 200, 800, 380, 855) {
		t.Error("dual presentation drew no audience pill at the bottom")
	}
}

func TestScorebarPresentationDrawsBottomBar(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 580, 859))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt"}}
	cfg.AggregateBarPos = "bottom"
	drawAggregateBar(img, presentationRatings(), cfg, nil, false)
	if !hasNonWhite(img, 0, 850, 580, 859) {
		t.Error("scorebar presentation drew no bar along the bottom edge")
	}
}

func TestSplitCriticsAudienceClassification(t *testing.T) {
	critics, audience, hasC, hasA := splitCriticsAudience(presentationRatings(),
		imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt"}})
	if !hasC || !hasA {
		t.Fatalf("expected both halves present, got hasC=%v hasA=%v", hasC, hasA)
	}
	// rt is the only critic source → critics == rt value.
	if critics != 9.4 {
		t.Errorf("critics = %v, want 9.4 (rt only)", critics)
	}
	// imdb + tmdb averaged for the audience.
	if want := (9.0 + 8.5) / 2; audience != want {
		t.Errorf("audience = %v, want %v (imdb+tmdb)", audience, want)
	}
}

func TestPresentationPillsNoopOnEmpty(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 200, 300))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{200, 200, 200, 255}}, image.Point{}, draw.Src)
	cfg := imageconfig.Config{Ratings: []string{"imdb"}}
	before := clonePixels(img)
	drawMinimalRating(img, nil, nil, false, cfg, 1.0, newOccupancy(img.Bounds()))
	drawDualRating(img, nil, nil, false, cfg, 1.0, newOccupancy(img.Bounds()), true)
	if before != clonePixels(img) {
		t.Error("presentation pills must not modify the image with no ratings")
	}
}

// hasNonWhite reports whether the rectangle [x0,x1)×[y0,y1) contains any visible
// non-white pixel.
func hasNonWhite(img *image.NRGBA, x0, y0, x1, y1 int) bool {
	for x := x0; x < x1; x++ {
		for y := y0; y < y1; y++ {
			r, g, b, a := img.At(x, y).RGBA()
			if a > 0 && (r < 65535 || g < 65535 || b < 65535) {
				return true
			}
		}
	}
	return false
}

// ── Genre badge tests ────────────────────────────────────────────────────────

func TestGenreBadgeDrawsBL(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 580, 859))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)
	drawGenreBadge(img, []string{"Action", "Drama", "Thriller"}, "bl", 1.0, newOccupancy(img.Bounds()), genreBadgeOpts{})

	bounds := img.Bounds()
	nonWhite := 0
	for x := 5; x < 200; x++ {
		for y := bounds.Max.Y - 40; y < bounds.Max.Y-5; y++ {
			r, g, b, a := img.At(x, y).RGBA()
			if a > 0 && (r < 65535 || g < 65535 || b < 65535) {
				nonWhite++
			}
		}
	}
	if nonWhite == 0 {
		t.Error("no genre badge pixels found in bottom-left area")
	}
}

func TestGenreBadgeLimitsToThreeGenres(t *testing.T) {
	// Just verify no panic with many genres.
	img := image.NewNRGBA(image.Rect(0, 0, 580, 859))
	drawGenreBadge(img, []string{"Action", "Drama", "Thriller", "Horror", "Sci-Fi"}, "bl", 1.0, newOccupancy(img.Bounds()), genreBadgeOpts{})
}

func TestGenreBadgeNoopOnEmpty(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 100, 150))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{128, 128, 128, 255}}, image.Point{}, draw.Src)
	before := clonePixels(img)
	drawGenreBadge(img, nil, "bl", 1.0, newOccupancy(img.Bounds()), genreBadgeOpts{})
	after := clonePixels(img)
	if before != after {
		t.Error("drawGenreBadge with empty genres must not modify the image")
	}
}

// ── Scale coverage (1.5× and 3.0×) ──────────────────────────────────────────

func TestOverlayFunctionsAtLargeScales(t *testing.T) {
	for _, scale := range []float64{1.5, 3.0} {
		scale := scale
		t.Run(fmt.Sprintf("scale=%.1f", scale), func(t *testing.T) {
			w := int(580 * scale)
			h := int(859 * scale)

			img := image.NewNRGBA(image.Rect(0, 0, w, h))
			draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)

			// drawQualityBadges: must return > 0 for non-empty tokens
			got := drawQualityBadges(img, []string{"4k", "hdr"}, scale, newOccupancy(img.Bounds()), qualityBadgeOpts{})
			if got == 0 {
				t.Errorf("drawQualityBadges returned 0 at scale %.1f", scale)
			}

			// drawAgeRatingBadge: must change pixels
			beforeAge := clonePixels(img)
			drawAgeRatingBadge(img, "TV-MA", "br", scale, newOccupancy(img.Bounds()), ageRatingOpts{})
			if clonePixels(img) == beforeAge {
				t.Errorf("drawAgeRatingBadge had no effect at scale %.1f", scale)
			}

			// drawGenreBadge: must change pixels
			beforeGenre := clonePixels(img)
			drawGenreBadge(img, []string{"Action", "Drama"}, "bl", scale, newOccupancy(img.Bounds()), genreBadgeOpts{})
			if clonePixels(img) == beforeGenre {
				t.Errorf("drawGenreBadge had no effect at scale %.1f", scale)
			}

			// drawTrendingBadge: must change pixels
			beforeTrend := clonePixels(img)
			drawTrendingBadge(img, scale, newOccupancy(img.Bounds()))
			if clonePixels(img) == beforeTrend {
				t.Errorf("drawTrendingBadge had no effect at scale %.1f", scale)
			}

			// drawProviderBadges: must change pixels
			beforeProv := clonePixels(img)
			drawProviderBadges(img, []provider.WatchProvider{{ID: 8, Name: "Netflix"}}, scale, newOccupancy(img.Bounds()), providerBadgeOpts{})
			if clonePixels(img) == beforeProv {
				t.Errorf("drawProviderBadges had no effect at scale %.1f", scale)
			}

			// drawAggregateBar: cfg.Size drives its internal scale factor
			var cfgSize imageconfig.MediaSize
			if scale >= 2.5 {
				cfgSize = imageconfig.Size4K
			} else {
				cfgSize = imageconfig.SizeLarge
			}
			barCfg := imageconfig.Default()
			barCfg.AggregateBar = true
			barCfg.AggregateBarPos = "bottom"
			barCfg.Size = cfgSize
			beforeBar := clonePixels(img)
			drawAggregateBar(img, []provider.Rating{{Source: "tmdb", Value: 8.0}}, barCfg, nil, false)
			if clonePixels(img) == beforeBar {
				t.Errorf("drawAggregateBar had no effect at scale %.1f", scale)
			}
		})
	}
}

// ── RenderWithOverlays integration test ─────────────────────────────────────

func TestRenderQualityAgeGenreOverlays(t *testing.T) {
	srcPNG := makeTestPNG(580, 859, color.NRGBA{255, 255, 255, 255})

	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL:     "http://fake/poster.jpg",
			ContentRating: "R",
			Genres:        []string{"Action", "Drama"},
			Ratings:       []provider.Rating{{Source: "tmdb", Value: 7.5, Label: "7.5"}},
		},
	}

	cfg := imageconfig.Default()
	cfg.Size = imageconfig.SizeNormal
	cfg.OutputFormat = imageconfig.OutputPNG
	cfg.AgeRating = true
	cfg.AgeRatingPos = "tl"
	cfg.Genre = true
	cfg.GenrePos = "bl"
	cfg.Badges = []string{"4k", "hdr"}

	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: srcPNG},
	}
	req := Request{MediaType: "poster", MediaID: "tt0468569", Config: cfg}
	res, err := p.Render(context.Background(), req)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	img, err := png.Decode(bytes.NewReader(res.ImageBytes))
	if err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if img == nil {
		t.Fatal("nil image")
	}
	b := img.Bounds()
	if b.Dx() == 0 || b.Dy() == 0 {
		t.Error("empty image bounds")
	}
}

// clonePixels returns a simple checksum of an image's pixel data for comparison.
func clonePixels(img *image.NRGBA) [4]uint64 {
	var sums [4]uint64
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := img.NRGBAAt(x, y)
			sums[0] += uint64(c.R)
			sums[1] += uint64(c.G)
			sums[2] += uint64(c.B)
			sums[3] += uint64(c.A)
		}
	}
	return sums
}

func TestCollectRatingsSkipsArtworkProvider(t *testing.T) {
	artworkProv := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL: "http://fake/poster.jpg",
			Ratings:   []provider.Rating{{Source: "tmdb", Value: 7.5}},
		},
	}

	reg := provider.NewRegistry()
	reg.Register(artworkProv)

	cfg := imageconfig.Default()
	cfg.ArtworkSource = "tmdb"
	pipe := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt1", Config: cfg}

	initial := &provider.MediaMeta{Ratings: []provider.Rating{{Source: "tmdb", Value: 7.5}}}
	all, _, _ := pipe.collectRatingsWithProviders(context.Background(), req, initial)

	// should only have the artwork ratings, artwork provider not called again
	if artworkProv.Calls > 0 {
		t.Errorf("artwork provider should not be called again in collectRatings, got %d calls", artworkProv.Calls)
	}
	if len(all) != 1 {
		t.Errorf("expected 1 rating, got %d", len(all))
	}
}

// ── Aggregate bar ─────────────────────────────────────────────────────────────

func TestAggregateBarDrawsOnImage(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 300, 450))
	ratings := []provider.Rating{
		{Source: "tmdb", Value: 8.5},
		{Source: "imdb", Value: 7.9},
	}
	cfg := imageconfig.Default()
	cfg.AggregateBar = true
	cfg.AggregateBarPos = "bottom"

	before := clonePixels(img)
	drawAggregateBar(img, ratings, cfg, nil, false)
	after := clonePixels(img)

	if before == after {
		t.Error("expected pixels to change after drawAggregateBar")
	}
}

func TestAggregateBarNoopOnEmptyRatings(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 300, 450))
	before := clonePixels(img)
	drawAggregateBar(img, nil, imageconfig.Default(), nil, false)
	after := clonePixels(img)
	if before != after {
		t.Error("expected no change on empty ratings")
	}
}

func TestAggregateBarTopPosition(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 300, 450))
	ratings := []provider.Rating{{Source: "imdb", Value: 6.0}}
	cfg := imageconfig.Default()
	cfg.AggregateBar = true
	cfg.AggregateBarPos = "top"
	cfg.Ratings = []string{"imdb"}

	drawAggregateBar(img, ratings, cfg, nil, false)
	// At least the top row of the image should be non-zero.
	r, g, b, a := img.At(0, 0).RGBA()
	if r == 0 && g == 0 && b == 0 && a == 0 {
		t.Error("expected top row to be painted for top position")
	}
}

func TestAggregateBarFiltersUnselectedSources(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 300, 450))
	ratings := []provider.Rating{
		{Source: "tmdb", Value: 9.0},       // in Ratings
		{Source: "letterboxd", Value: 1.0}, // not in Ratings — excluded
	}
	cfg := imageconfig.Default()
	cfg.AggregateBar = true
	cfg.AggregateBarPos = "bottom"
	cfg.Ratings = []string{"tmdb"} // only tmdb

	// With only tmdb (9.0), fill should be green.
	drawAggregateBar(img, ratings, cfg, nil, false)
	// The filled area at bottom-left should be green-ish.
	bounds := img.Bounds()
	px := img.NRGBAAt(bounds.Min.X+5, bounds.Max.Y-5)
	if px.G < px.R {
		t.Errorf("expected green fill for high score, got R=%d G=%d B=%d", px.R, px.G, px.B)
	}
}

// ── Trending badge ────────────────────────────────────────────────────────────

func TestTrendingBadgeDrawsOnImage(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 300, 450))
	before := clonePixels(img)
	drawTrendingBadge(img, 1.0, newOccupancy(img.Bounds()))
	after := clonePixels(img)
	if before == after {
		t.Error("expected pixels to change after drawTrendingBadge")
	}
}

// ── Anime provider accent colours ─────────────────────────────────────────────

func TestAnimeProviderAccentColors(t *testing.T) {
	for _, source := range []string{"anilist", "mal", "kitsu"} {
		c, ok := providerAccent[source]
		if !ok {
			t.Errorf("no accent color for provider %q", source)
			continue
		}
		if c.A == 0 {
			t.Errorf("accent for %q has zero alpha", source)
		}
	}
}

// ── Backdrop logo auto-enable ─────────────────────────────────────────────────

func TestBackdropAsPosterAutoEnablesLogoOverlay(t *testing.T) {
	// When BackdropAsPoster is true, Render should attempt to fetch the logo
	// URL from meta (even when BackdropLogo is false).
	logoFetched := false
	fetcher := &recordingFetcher{
		data: makeTestPNG(300, 450, color.NRGBA{50, 50, 80, 255}),
		onFetch: func(url string) {
			if url == "http://fake/logo.png" {
				logoFetched = true
			}
		},
	}
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL:   "http://fake/poster.jpg",
			BackdropURL: "http://fake/backdrop.jpg",
			LogoURL:     "http://fake/logo.png",
		},
	}
	p := &Pipeline{providers: testRegistry(stub), fetcher: fetcher}

	cfg := imageconfig.Default()
	cfg.BackdropAsPoster = true
	cfg.BackdropLogo = false // must still trigger logo fetch
	req := Request{MediaType: "poster", MediaID: "tt1", Config: cfg}

	if _, err := p.Render(context.Background(), req); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !logoFetched {
		t.Error("expected logo fetch when BackdropAsPoster=true, got none")
	}
}

func TestBackdropAsPosterNoLogoWhenBackdropURLEmpty(t *testing.T) {
	// When BackdropAsPoster is true but BackdropURL is empty (provider has no
	// backdrop), the pipeline falls back to poster artwork. The logo overlay must
	// NOT fire in that case to avoid double-stamping a poster's baked-in title.
	logoFetched := false
	fetcher := &recordingFetcher{
		data: makeTestPNG(300, 450, color.NRGBA{50, 50, 80, 255}),
		onFetch: func(url string) {
			if url == "http://fake/logo.png" {
				logoFetched = true
			}
		},
	}
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL:   "http://fake/poster.jpg",
			BackdropURL: "", // no backdrop available
			LogoURL:     "http://fake/logo.png",
		},
	}
	p := &Pipeline{providers: testRegistry(stub), fetcher: fetcher}

	cfg := imageconfig.Default()
	cfg.BackdropAsPoster = true
	cfg.BackdropLogo = false
	req := Request{MediaType: "poster", MediaID: "tt1", Config: cfg}

	if _, err := p.Render(context.Background(), req); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if logoFetched {
		t.Error("logo overlay must not fire when BackdropURL is empty (poster fallback)")
	}
}

func TestCleanTextPreferenceAppliesLogoOverlay(t *testing.T) {
	// "Clean" is the textless base with the title logo composited back on top,
	// so Render must fetch and overlay the logo — that's what sets it apart from
	// plain "textless" (which leaves the art bare).
	logoFetched := false
	fetcher := &recordingFetcher{
		data: makeTestPNG(300, 450, color.NRGBA{50, 50, 80, 255}),
		onFetch: func(url string) {
			if url == "http://fake/logo.png" {
				logoFetched = true
			}
		},
	}
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL: "http://fake/poster.jpg",
			LogoURL:   "http://fake/logo.png",
		},
	}
	p := &Pipeline{providers: testRegistry(stub), fetcher: fetcher}

	cfg := imageconfig.Default()
	cfg.TextPreference = imageconfig.TextClean
	req := Request{MediaType: "poster", MediaID: "tt1", Config: cfg}

	if _, err := p.Render(context.Background(), req); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !logoFetched {
		t.Error("expected logo overlay for the clean text preference, got none")
	}
}

func TestTextlessTextPreferenceDoesNotOverlayLogo(t *testing.T) {
	// Plain "textless" leaves the art bare: no logo overlay.
	logoFetched := false
	fetcher := &recordingFetcher{
		data: makeTestPNG(300, 450, color.NRGBA{50, 50, 80, 255}),
		onFetch: func(url string) {
			if url == "http://fake/logo.png" {
				logoFetched = true
			}
		},
	}
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL: "http://fake/poster.jpg",
			LogoURL:   "http://fake/logo.png",
		},
	}
	p := &Pipeline{providers: testRegistry(stub), fetcher: fetcher}

	cfg := imageconfig.Default()
	cfg.TextPreference = imageconfig.TextTextless
	req := Request{MediaType: "poster", MediaID: "tt1", Config: cfg}

	if _, err := p.Render(context.Background(), req); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if logoFetched {
		t.Error("plain textless must not overlay a logo")
	}
}

func TestLogoFallsBackAcrossProviders(t *testing.T) {
	// The configured source (tmdb) has no logo; the pipeline must fall back to
	// Fanart's logo rather than the poster or a placeholder.
	fetched := ""
	fetcher := &recordingFetcher{
		data:    makeTestPNG(800, 200, color.NRGBA{10, 10, 10, 255}),
		onFetch: func(url string) { fetched = url },
	}
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{PosterURL: "http://tmdb/poster.jpg"}})
	reg.Register(&provider.StubProvider{ProviderName: "fanart", Meta: &provider.MediaMeta{LogoURL: "http://fanart/logo.png"}})
	p := &Pipeline{providers: reg, fetcher: fetcher}

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	if _, err := p.Render(context.Background(), Request{MediaType: "logo", MediaID: "tt1", Config: cfg}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if fetched != "http://fanart/logo.png" {
		t.Errorf("expected the Fanart logo to be used, got %q", fetched)
	}
}

func TestPrimaryLogoWinsWithoutFallback(t *testing.T) {
	// When the configured source has the logo, its logo is used — the fallback
	// provider's logo is not fetched. (Fanart is still queried for ratings, but
	// that goes through provider.Fetch, not the image fetcher.)
	fetched := ""
	fetcher := &recordingFetcher{
		data:    makeTestPNG(800, 200, color.NRGBA{10, 10, 10, 255}),
		onFetch: func(url string) { fetched = url },
	}
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{LogoURL: "http://tmdb/logo.png"}})
	reg.Register(&provider.StubProvider{ProviderName: "fanart", Meta: &provider.MediaMeta{LogoURL: "http://fanart/logo.png"}})
	p := &Pipeline{providers: reg, fetcher: fetcher}

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	if _, err := p.Render(context.Background(), Request{MediaType: "logo", MediaID: "tt1", Config: cfg}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if fetched != "http://tmdb/logo.png" {
		t.Errorf("expected the primary (tmdb) logo, got %q", fetched)
	}
}

func TestLogoLastResortFallsBackToPoster(t *testing.T) {
	// No provider has a logo: the last-resort selection lets the poster stand in
	// rather than returning a placeholder.
	fetched := ""
	fetcher := &recordingFetcher{
		data:    makeTestPNG(300, 450, color.NRGBA{10, 10, 10, 255}),
		onFetch: func(url string) { fetched = url },
	}
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{PosterURL: "http://tmdb/poster.jpg"}})
	p := &Pipeline{providers: reg, fetcher: fetcher}

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	if _, err := p.Render(context.Background(), Request{MediaType: "logo", MediaID: "tt1", Config: cfg}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if fetched != "http://tmdb/poster.jpg" {
		t.Errorf("expected poster last-resort fallback, got %q", fetched)
	}
}

func TestParseEpisodeID(t *testing.T) {
	cases := []struct {
		id      string
		series  string
		season  int
		episode int
		ok      bool
	}{
		{"tt0903747:1:1", "tt0903747", 1, 1, true},
		{"tt0903747:5:14", "tt0903747", 5, 14, true},
		{"tmdb:1396:2:7", "tmdb:1396", 2, 7, true},
		{"1396:0:1", "1396", 0, 1, true}, // season 0 = specials
		{"tt0903747", "", 0, 0, false},   // no season/episode → not an episode
		{"tt0903747:1", "", 0, 0, false}, // missing episode
		{"tt0903747:x:1", "", 0, 0, false},
		{"tt0903747:1:0", "", 0, 0, false}, // episodes are 1-based
		{"", "", 0, 0, false},
	}
	for _, c := range cases {
		series, season, episode, ok := parseEpisodeID(c.id)
		if ok != c.ok || series != c.series || season != c.season || episode != c.episode {
			t.Errorf("parseEpisodeID(%q) = (%q,%d,%d,%v), want (%q,%d,%d,%v)",
				c.id, series, season, episode, ok, c.series, c.season, c.episode, c.ok)
		}
	}
}

// recordingFetcher wraps a stubImageFetcher and calls onFetch for each URL.
type recordingFetcher struct {
	data    []byte
	onFetch func(string)
}

func (r *recordingFetcher) Fetch(_ context.Context, url string) ([]byte, error) {
	if r.onFetch != nil {
		r.onFetch(url)
	}
	return r.data, nil
}

// ── HDR hierarchy deduplication ───────────────────────────────────────────────

func TestDedupeQualityTokensHDRHierarchy(t *testing.T) {
	cases := []struct {
		in   []string
		want []string
	}{
		{[]string{"hdr10plus", "hdr10", "hdr"}, []string{"hdr10plus"}},
		{[]string{"4k", "hdr10", "hdr"}, []string{"4k", "hdr10"}},
		{[]string{"dv", "hdr10plus", "hdr10", "hdr", "atmos"}, []string{"dv", "atmos"}},
		{[]string{"4k", "atmos", "imax"}, []string{"4k", "atmos", "imax"}},
		{[]string{"hdr"}, []string{"hdr"}},
	}
	for _, tc := range cases {
		got := dedupeQualityTokens(tc.in)
		if len(got) != len(tc.want) {
			t.Errorf("dedupeQualityTokens(%v): got %v, want %v", tc.in, got, tc.want)
			continue
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Errorf("dedupeQualityTokens(%v)[%d]: got %q, want %q", tc.in, i, got[i], tc.want[i])
			}
		}
	}
}

// ── resizeContain ─────────────────────────────────────────────────────────────

func TestResizeContainNeverExceedsBounds(t *testing.T) {
	cases := []struct{ sw, sh, mw, mh int }{
		{1000, 200, 500, 125}, // wider source → letterboxed
		{200, 1000, 500, 125}, // taller source → pillarboxed
		{400, 100, 500, 125},  // same aspect
	}
	for _, tc := range cases {
		src := image.NewNRGBA(image.Rect(0, 0, tc.sw, tc.sh))
		out := resizeContain(src, tc.mw, tc.mh)
		b := out.Bounds()
		if b.Dx() != tc.mw || b.Dy() != tc.mh {
			t.Errorf("resizeContain(%dx%d → %dx%d): got canvas %dx%d",
				tc.sw, tc.sh, tc.mw, tc.mh, b.Dx(), b.Dy())
		}
	}
}

// flakyProvider serves a rating until it is told to break, then behaves the way
// a scraped source does when its markup changes: it succeeds with no ratings.
type flakyProvider struct {
	name   string
	broken bool
	empty  bool
}

func (f *flakyProvider) Name() string { return f.name }

func (f *flakyProvider) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	switch {
	case f.broken:
		return nil, fmt.Errorf("%s: upstream refused", f.name)
	case f.empty:
		return &provider.MediaMeta{}, nil
	default:
		return &provider.MediaMeta{Ratings: []provider.Rating{
			{Source: f.name, Value: 8.4, Label: "8.4"},
		}}, nil
	}
}

func ratingsFor(t *testing.T, p *Pipeline, req Request) []provider.Rating {
	t.Helper()
	all, _, _ := p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
	return all
}

// The behaviour the whole change exists for: once a source has answered, a
// later failure must not erase its badge.
func TestDegradedSourceFallsBackToLastKnownGood(t *testing.T) {
	flaky := &flakyProvider{name: "rt"}
	p := &Pipeline{providers: testRegistry(flaky), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"rt"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}

	if got := ratingsFor(t, p, req); len(got) != 1 {
		t.Fatalf("first fetch returned %d ratings, want 1", len(got))
	}

	flaky.broken = true
	got := ratingsFor(t, p, req)
	if len(got) != 1 || got[0].Source != "rt" {
		t.Errorf("after the source broke, got %+v; expected the remembered rating", got)
	}

	// And the breakage must be visible rather than papered over.
	snap := p.Health().Snapshot()
	if len(snap) == 0 || snap[0].Healthy {
		t.Errorf("expected rt to be reported unhealthy, got %+v", snap)
	}
	if snap[0].StaleServes == 0 {
		t.Error("expected the fallback to be counted as a stale serve")
	}
}

// The quieter failure: a scrape that still returns 200 but no longer finds the
// rating in the page.
func TestSilentlyEmptySourceFallsBack(t *testing.T) {
	flaky := &flakyProvider{name: "letterboxd"}
	p := &Pipeline{providers: testRegistry(flaky), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"letterboxd"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}
	ratingsFor(t, p, req)

	flaky.empty = true
	if got := ratingsFor(t, p, req); len(got) != 1 {
		t.Errorf("an empty scrape erased the badge: got %+v", got)
	}
}

// Without a tracker the pipeline must behave exactly as it did before.
func TestNoTrackerMeansNoFallback(t *testing.T) {
	flaky := &flakyProvider{name: "rt"}
	p := &Pipeline{providers: testRegistry(flaky), fetcher: &stubImageFetcher{}}

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"rt"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}
	ratingsFor(t, p, req)

	flaky.broken = true
	if got := ratingsFor(t, p, req); len(got) != 0 {
		t.Errorf("without a tracker the rating should drop, got %+v", got)
	}
}

// A source that has never worked has nothing to fall back to, and must not
// invent one.
func TestNeverSuccessfulSourceHasNoFallback(t *testing.T) {
	flaky := &flakyProvider{name: "rt", broken: true}
	p := &Pipeline{providers: testRegistry(flaky), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"rt"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}
	if got := ratingsFor(t, p, req); len(got) != 0 {
		t.Errorf("expected no ratings, got %+v", got)
	}
}

// rankProvider supplies a top-rated rank the way the local IMDb dataset does:
// alongside its rating, not from the artwork source.
type rankProvider struct{ rank int }

func (r *rankProvider) Name() string { return "imdb_local" }

func (r *rankProvider) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return &provider.MediaMeta{
		TopRatedRank: r.rank,
		Ratings:      []provider.Rating{{Source: "imdb", Value: 9.0, Label: "9.0"}},
	}, nil
}

func TestTopRatedRankReachesTheBadgeMeta(t *testing.T) {
	p := &Pipeline{providers: testRegistry(&rankProvider{rank: 42}), fetcher: &stubImageFetcher{}}
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb"}

	artwork := &provider.MediaMeta{}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}
	if _, _, _ = p.collectRatingsWithProviders(context.Background(), req, artwork); artwork.TopRatedRank != 42 {
		t.Errorf("TopRatedRank = %d, want 42 carried onto the artwork meta", artwork.TopRatedRank)
	}
}

// A title outside the ranking must draw nothing, not "TOP #0".
func TestUnrankedTitleCarriesNoRank(t *testing.T) {
	p := &Pipeline{providers: testRegistry(&rankProvider{rank: 0}), fetcher: &stubImageFetcher{}}
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb"}

	artwork := &provider.MediaMeta{}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}
	if _, _, _ = p.collectRatingsWithProviders(context.Background(), req, artwork); artwork.TopRatedRank != 0 {
		t.Errorf("TopRatedRank = %d, want 0", artwork.TopRatedRank)
	}
}

// The badge changes pixels, so both its toggle and its position have to be part
// of the cache key or two different looks would share one cached render.
func TestTopRatedIsInTheCacheKey(t *testing.T) {
	base := imageconfig.Default()
	on := base
	on.TopRated = true
	moved := on
	moved.TopRatedPos = "br"

	if imageconfig.CacheKey(base) == imageconfig.CacheKey(on) {
		t.Error("enabling the top-rated badge did not change the cache key")
	}
	if imageconfig.CacheKey(on) == imageconfig.CacheKey(moved) {
		t.Error("moving the top-rated badge did not change the cache key")
	}
}
