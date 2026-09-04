package compose

import (
	"bytes"
	"context"
	"image"
	"image/color"
	_ "image/jpeg"
	_ "image/png"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// alwaysFailing is a rating source that is up but refusing, which is what puts
// it into cooldown and holds it out of later renders.
type alwaysFailing struct{ name string }

func (a *alwaysFailing) Name() string            { return a.name }
func (a *alwaysFailing) RatingSources() []string { return []string{a.name} }
func (a *alwaysFailing) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return nil, &provider.RateLimitError{Source: a.name, RetryAfter: time.Minute, Status: 429}
}

// One source down draws an X. Everything down drew nothing at all, because the
// strip was gated on the list of ratings that came back rather than the list it
// draws. That is the 2026-07-30 shape, where one source's quota took out nine.
//
// This has to go through Render: a test that calls drawBadgesInPlace directly
// enters below the guard and cannot see it.
func TestEverySourceHeldOutDrawsNoStrip(t *testing.T) {
	art := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	}
	reg := provider.NewRegistry()
	reg.Register(art)
	reg.Register(&alwaysFailing{name: "imdb"})
	reg.Register(&alwaysFailing{name: "rt"})

	render := func(sources []string) *image.NRGBA {
		p := &Pipeline{providers: reg,
			fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}
		p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))
		cfg := imageconfig.Default()
		cfg.ArtworkSource = imageconfig.ArtworkTMDB
		cfg.Ratings = sources
		res, err := p.Render(context.Background(), Request{
			MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg,
		})
		if err != nil {
			t.Fatalf("Render: %v", err)
		}
		img, _, err := image.Decode(bytes.NewReader(res.ImageBytes))
		if err != nil {
			t.Fatalf("decode render: %v", err)
		}
		out := image.NewNRGBA(img.Bounds())
		for y := img.Bounds().Min.Y; y < img.Bounds().Max.Y; y++ {
			for x := img.Bounds().Min.X; x < img.Bounds().Max.X; x++ {
				out.Set(x, y, color.NRGBAModel.Convert(img.At(x, y)))
			}
		}
		return out
	}

	none := render(nil)
	allDown := render([]string{"imdb", "rt"})

	// A held-out source is not marked: at that moment we cannot tell a rating we
	// failed to reach from one that never existed. So the poster is the one it
	// would have been with those sources unconfigured.
	if !identical(none, allDown) {
		t.Error("a poster with every configured source held out differs from one asking for no ratings, so something was drawn for a source we could not reach")
	}
}
