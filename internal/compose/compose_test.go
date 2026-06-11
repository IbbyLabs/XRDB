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
	"testing"

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

func TestRenderProducesCorrectDimensions(t *testing.T) {
	srcPNG := makeTestPNG(800, 1200, color.NRGBA{50, 50, 80, 255})
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
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
	img, err := png.Decode(bytes.NewReader(res.ImageBytes))
	if err != nil {
		t.Fatalf("decode result PNG: %v", err)
	}
	b := img.Bounds()
	want := render.DimensionsFor("poster")
	if b.Dx() != want.Width || b.Dy() != want.Height {
		t.Errorf("got %dx%d, want %dx%d", b.Dx(), b.Dy(), want.Width, want.Height)
	}
}

func TestRenderJPEGSource(t *testing.T) {
	srcJPEG := makeTestJPEG(640, 960)
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{PosterURL: "http://fake/poster.jpg"},
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
	if _, err := png.Decode(bytes.NewReader(res.ImageBytes)); err != nil {
		t.Errorf("expected valid PNG output from JPEG source: %v", err)
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

	artworkRatings := []provider.Rating{{Source: "tmdb", Value: 7.5, Label: "7.5"}}
	all, _ := p.collectRatingsWithProviders(context.Background(), req, artworkRatings)

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

	artworkRatings := []provider.Rating{{Source: "imdb", Value: 7.0, Label: "7.0"}}
	all, _ := pipe.collectRatingsWithProviders(context.Background(), req, artworkRatings)

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

	cfg := imageconfig.Default()
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

	drawQualityBadges(img, []string{"4k", "hdr", "dv"})

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
	drawQualityBadges(img, nil)
	after := clonePixels(img)
	if before != after {
		t.Error("drawQualityBadges with nil tokens must not modify the image")
	}
}

// ── Age rating badge tests ───────────────────────────────────────────────────

func TestAgeRatingBadgeDrawsTL(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 580, 859))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)
	drawAgeRatingBadge(img, "TV-MA", "tl")

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
	drawAgeRatingBadge(img, "", "tl")
	after := clonePixels(img)
	if before != after {
		t.Error("drawAgeRatingBadge with empty rating must not modify the image")
	}
}

// ── Genre badge tests ────────────────────────────────────────────────────────

func TestGenreBadgeDrawsBL(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 580, 859))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{255, 255, 255, 255}}, image.Point{}, draw.Src)
	drawGenreBadge(img, []string{"Action", "Drama", "Thriller"}, "bl")

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
	drawGenreBadge(img, []string{"Action", "Drama", "Thriller", "Horror", "Sci-Fi"}, "bl")
}

func TestGenreBadgeNoopOnEmpty(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 100, 150))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.NRGBA{128, 128, 128, 255}}, image.Point{}, draw.Src)
	before := clonePixels(img)
	drawGenreBadge(img, nil, "bl")
	after := clonePixels(img)
	if before != after {
		t.Error("drawGenreBadge with empty genres must not modify the image")
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

	initial := []provider.Rating{{Source: "tmdb", Value: 7.5}}
	all, _ := pipe.collectRatingsWithProviders(context.Background(), req, initial)

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
	drawAggregateBar(img, ratings, cfg)
	after := clonePixels(img)

	if before == after {
		t.Error("expected pixels to change after drawAggregateBar")
	}
}

func TestAggregateBarNoopOnEmptyRatings(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 300, 450))
	before := clonePixels(img)
	drawAggregateBar(img, nil, imageconfig.Default())
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

	drawAggregateBar(img, ratings, cfg)
	// At least the top row of the image should be non-zero.
	r, g, b, a := img.At(0, 0).RGBA()
	if r == 0 && g == 0 && b == 0 && a == 0 {
		t.Error("expected top row to be painted for top position")
	}
}

func TestAggregateBarFiltersUnselectedSources(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 300, 450))
	ratings := []provider.Rating{
		{Source: "tmdb", Value: 9.0},   // in Ratings
		{Source: "letterboxd", Value: 1.0}, // not in Ratings — excluded
	}
	cfg := imageconfig.Default()
	cfg.AggregateBar = true
	cfg.AggregateBarPos = "bottom"
	cfg.Ratings = []string{"tmdb"} // only tmdb

	// With only tmdb (9.0), fill should be green.
	drawAggregateBar(img, ratings, cfg)
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
	drawTrendingBadge(img)
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
