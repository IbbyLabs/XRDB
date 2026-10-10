package compose

import (
	"context"
	"image/color"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func TestFaultRetryTakesTheLongestKnownWait(t *testing.T) {
	_, fr := withFaultRetry(context.Background())
	fr.note(30 * time.Second)
	fr.note(2 * time.Minute)
	if got := fr.after(); got != 2*time.Minute {
		t.Errorf("after = %v, want 2m", got)
	}
}

func TestFaultRetryWithAnUnknownEndIsZero(t *testing.T) {
	_, fr := withFaultRetry(context.Background())
	fr.note(2 * time.Minute)
	fr.note(0)
	if got := fr.after(); got != 0 {
		t.Errorf("after = %v, want 0", got)
	}
}

func TestFaultRetryAbsentFromContextIsSafe(t *testing.T) {
	faultRetryFrom(context.Background()).note(time.Minute)
	if got := faultRetryFrom(context.Background()).after(); got != 0 {
		t.Errorf("after = %v, want 0", got)
	}
}

// The render that meets the 429 and the ones held out after it both carry how
// long the source has left, so neither is cached past its return.
func TestRenderCarriesTheCooldownLeft(t *testing.T) {
	art := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	}
	reg := provider.NewRegistry()
	reg.Register(art)
	reg.Register(&alwaysFailing{name: "imdb"})
	p := &Pipeline{providers: reg,
		fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))
	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	cfg.Ratings = []string{"imdb"}

	for i, id := range []string{"tt1", "tt2"} {
		res, err := p.Render(context.Background(), Request{
			MediaType: "poster", ContentType: "movie", MediaID: id, Config: cfg,
		})
		if err != nil {
			t.Fatalf("Render %s: %v", id, err)
		}
		if !res.Degraded || res.DegradedByUs {
			t.Fatalf("render %d: Degraded=%v DegradedByUs=%v, want a source fault", i, res.Degraded, res.DegradedByUs)
		}
		if res.FaultRetryIn <= 0 || res.FaultRetryIn > time.Minute {
			t.Errorf("render %d: FaultRetryIn = %v, want within the 1m Retry-After", i, res.FaultRetryIn)
		}
	}
}
