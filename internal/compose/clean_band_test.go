package compose

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func renderCleanBandPoster(t *testing.T, genreOn bool) image.Image {
	t.Helper()
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL:     "http://fake/poster.jpg",
			ContentRating: "TV-MA",
			Genres:        []string{"Sci-Fi"},
			Ratings:       []provider.Rating{{Source: "tmdb", Value: 8.4, Label: "8.4"}, {Source: "imdb", Value: 8.5, Label: "8.5"}},
		},
	}
	cfg := imageconfig.Default()
	cfg.Size = imageconfig.SizeNormal
	cfg.OutputFormat = imageconfig.OutputPNG
	cfg.Ratings = []string{"tmdb", "imdb"}
	cfg.AgeRating = true
	cfg.AgeRatingPos = "br"
	cfg.Genre = genreOn
	cfg.GenrePos = "bc"
	cfg.GenreBadgeStyle = "clean"
	cfg.GenreBadgeMaxGenres = 1
	p := &Pipeline{
		providers: testRegistry(stub),
		fetcher:   &stubImageFetcher{data: makeTestPNG(580, 859, color.NRGBA{255, 255, 255, 255})},
	}
	res, err := p.Render(context.Background(), Request{MediaType: "poster", MediaID: "tt1190634", Config: cfg})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	img, err := png.Decode(bytes.NewReader(res.ImageBytes))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out := os.Getenv("CLEAN_BAND_OUT"); out != "" && genreOn {
		f, err := os.Create(out)
		if err != nil {
			t.Fatalf("create preview: %v", err)
		}
		defer f.Close()
		if err := png.Encode(f, img); err != nil {
			t.Fatalf("write preview: %v", err)
		}
	}
	return img
}

// lowestBadgeRow is the lowest row holding near-black badge fill in the middle of the frame.
func lowestBadgeRow(img image.Image) int {
	b := img.Bounds()
	for y := b.Max.Y - 1; y >= b.Min.Y; y-- {
		for x := b.Dx() / 5; x < b.Dx()*4/5; x++ {
			r, g, bl, _ := img.At(x, y).RGBA()
			if r>>8 < 30 && g>>8 < 30 && bl>>8 < 30 {
				return y
			}
		}
	}
	return -1
}

// FR-213: a bottom-centre clean label owns the poster's foot over v2's scrim,
// and the ratings row stacks above it.
func TestCleanBandPushesTheRatingsUp(t *testing.T) {
	without := lowestBadgeRow(renderCleanBandPoster(t, false))
	img := renderCleanBandPoster(t, true)
	with := lowestBadgeRow(img)
	if with < 0 || without < 0 {
		t.Fatalf("no ratings row found (with %d, without %d)", with, without)
	}
	if with > without-20 {
		t.Errorf("ratings row bottom at y=%d with the band, %d without; want it pushed up", with, without)
	}
	foot := img.At(290, img.Bounds().Max.Y-3)
	if r, _, _, _ := foot.RGBA(); r>>8 > 120 {
		t.Errorf("foot of a white poster is %d, want the scrim to darken it", r>>8)
	}
}

func TestCleanBandOnlyAtBottomCentre(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.Genre, cfg.GenreBadgeStyle, cfg.GenrePos = true, "clean", "bc"
	if !cleanBandActive("poster", cfg, true) {
		t.Fatal("bottom-centre clean poster should take the band")
	}
	cfg.GenrePos = "tc"
	if cleanBandActive("poster", cfg, true) {
		t.Error("top-centre clean must keep its layout")
	}
	cfg.GenrePos = "bc"
	if cleanBandActive("backdrop", cfg, true) {
		t.Error("backdrops keep their layout")
	}
}
