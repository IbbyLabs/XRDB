package compose

import (
	"context"
	"image/color"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// blockingArtworkStub holds the artwork fetch open until the test lets it go,
// standing in for the slowest phase of a cold render.
type blockingArtworkStub struct {
	provider.StubProvider
	entered  chan struct{}
	release  chan struct{}
	returned chan struct{}
}

func (b *blockingArtworkStub) Fetch(_ context.Context, _, _ string) (*provider.MediaMeta, error) {
	close(b.entered)
	<-b.release
	close(b.returned)
	return b.Meta, b.Err
}

// signallingDetector reports the moment the addon is asked.
type signallingDetector struct{ asked chan struct{} }

func (s *signallingDetector) Detect(_ context.Context, _, _ string) (map[string]bool, error) {
	close(s.asked)
	return map[string]bool{"4k": true}, nil
}

// The addon lookup must overlap the artwork fetch, not queue behind it. The
// fetch is serial and on a cold title the longest phase of the render, so
// asking afterwards adds its whole duration to every first render.
//
// The artwork stub blocks until the detector has been asked. If the lookup ever
// moves back to after the fetch, nothing can release the stub and this test
// fails on its deadline rather than passing quietly.
func TestTheAddonIsAskedWhileTheArtworkIsStillFetching(t *testing.T) {
	art := &blockingArtworkStub{
		StubProvider: provider.StubProvider{
			ProviderName: "tmdb",
			Meta:         &provider.MediaMeta{Title: "x", PosterURL: "http://tmdb/poster.jpg"},
		},
		entered:  make(chan struct{}),
		release:  make(chan struct{}),
		returned: make(chan struct{}),
	}
	reg := provider.NewRegistry()
	reg.Register(art)

	det := &signallingDetector{asked: make(chan struct{})}
	p := &Pipeline{providers: reg, fetcher: &recordingFetcher{data: makeTestPNG(60, 90, color.NRGBA{20, 20, 20, 255})}}
	p.SetQualityDetector(det, time.Hour)

	cfg := imageconfig.Default()
	cfg.Badges = []string{"4k", "remux"}
	cfg.QualityBadgesDetect = true

	done := make(chan error, 1)
	go func() {
		_, err := p.Render(context.Background(), Request{
			MediaType: "poster", MediaID: "tt0111161", ContentType: "movie", Config: cfg,
		})
		done <- err
	}()

	select {
	case <-art.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("the artwork fetch was never entered")
	}

	select {
	case <-det.asked:
		// The addon was asked while the artwork fetch is still blocked.
	case <-time.After(5 * time.Second):
		t.Fatal("the addon was not asked until the artwork fetch had finished")
	}

	select {
	case <-art.returned:
		t.Fatal("the artwork fetch returned before the addon was asked")
	default:
	}

	close(art.release)
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Render: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Render did not finish")
	}
}

// A TMDB id is not one any addon keys on, so the lookup has to wait for the
// artwork fetch to resolve it rather than being asked about the raw id.
func TestATMDBIDIsOnlyAskedAboutOnceResolved(t *testing.T) {
	det := &stubDetector{tokens: map[string]bool{"4k": true}}
	p := pipelineWithDetector(det)

	if r := p.startQualityDetect(context.Background(), imageconfigBadges{
		badges: []string{"4k"}, detect: true,
	}, "movie", "550"); r != nil {
		t.Error("a raw TMDB id was sent to the addon")
	}
	if n := det.calls.Load(); n != 0 {
		t.Errorf("addon called %d times for a TMDB id, want 0", n)
	}
}
