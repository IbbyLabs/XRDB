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
func TestEverySourceHeldOutStillDrawsTheStrip(t *testing.T) {
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

	if identical(none, allDown) {
		t.Error("with every configured source held out the poster is identical to one asking for no ratings at all, so nothing was drawn")
	}
}

// multiSourceFailing stands in for MDBList: one provider answering many rating
// sources, none of them named after it.
type multiSourceFailing struct{ sources []string }

func (m *multiSourceFailing) Name() string            { return "mdblist" }
func (m *multiSourceFailing) RatingSources() []string { return m.sources }
func (m *multiSourceFailing) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return nil, &provider.RateLimitError{Source: "mdblist", RetryAfter: time.Minute, Status: 429}
}

// The 2026-07-30 shape: one quota takes out nine sources. The held-out list
// names the provider and the strip is filtered by rating source, so a user
// configured for rt and metacritic has neither name in their config and used to
// see both badges silently disappear.
func TestAProviderIsExpandedToTheSourcesItAnswers(t *testing.T) {
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	})
	reg.Register(&multiSourceFailing{sources: []string{"imdb", "rt", "metacritic", "letterboxd"}})

	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}
	got := p.unavailableSources([]string{"mdblist"}, []string{"rt", "metacritic"}, nil)

	if len(got) != 2 {
		t.Fatalf("a provider answering four sources produced %d placeholders for a two-source config: %v", len(got), got)
	}
	for _, want := range []string{"rt", "metacritic"} {
		found := false
		for _, g := range got {
			if g == want {
				found = true
			}
		}
		if !found {
			t.Errorf("%q is configured and its provider is down, but it got no placeholder: %v", want, got)
		}
	}
}

// A source another provider answered has its score, so it must not be crossed
// out. Without this an OMDb-served imdb would gain an X while showing a number.
func TestASourceAnsweredElsewhereIsNotMarkedUnavailable(t *testing.T) {
	reg := provider.NewRegistry()
	reg.Register(&multiSourceFailing{sources: []string{"imdb", "rt"}})
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}

	got := p.unavailableSources([]string{"mdblist"}, []string{"imdb", "rt"},
		[]provider.Rating{{Source: "imdb", Value: 8.4, Label: "8.4"}})

	if len(got) != 1 || got[0] != "rt" {
		t.Errorf("expected only rt to be unavailable, got %v", got)
	}
}

// Two degraded providers can share a source; it gets one badge, not two.
func TestASharedSourceIsNotDuplicated(t *testing.T) {
	reg := provider.NewRegistry()
	reg.Register(&multiSourceFailing{sources: []string{"imdb"}})
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}

	got := p.unavailableSources([]string{"mdblist", "mdblist"}, []string{"imdb"}, nil)
	if len(got) != 1 {
		t.Errorf("a shared source produced %d placeholders: %v", len(got), got)
	}
}

// A source the user never configured must not appear just because its provider
// went down.
func TestAnUnconfiguredSourceGetsNoPlaceholder(t *testing.T) {
	reg := provider.NewRegistry()
	reg.Register(&multiSourceFailing{sources: []string{"imdb", "rt", "letterboxd"}})
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}

	got := p.unavailableSources([]string{"mdblist"}, []string{"imdb"}, nil)
	if len(got) != 1 || got[0] != "imdb" {
		t.Errorf("expected only the configured source, got %v", got)
	}
}
