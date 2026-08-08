package compose

import (
	"bytes"
	"context"
	"image/color"
	"log/slog"
	"sync"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

const sharedFetchMsg = "A ratings source's answer was waited on rather than fetched"

// slowOnce answers slowly and counts how many times it was actually called.
type slowOnce struct {
	name  string
	delay time.Duration
	mu    sync.Mutex
	calls int
}

func (s *slowOnce) Name() string            { return s.name }
func (s *slowOnce) RatingSources() []string { return []string{s.name} }
func (s *slowOnce) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	s.mu.Lock()
	s.calls++
	s.mu.Unlock()
	time.Sleep(s.delay)
	return &provider.MediaMeta{Title: "T", Ratings: []provider.Rating{
		{Source: s.name, Value: 8.0, Label: "8.0"},
	}}, nil
}

// Concurrent renders of one title share a single fetch. A follower's elapsed
// time is the leader's whole round trip and costs the source nothing, so
// counting it as time spent fetching overstates what the source is doing.
func TestASharedFetchIsReportedApartFromARealOne(t *testing.T) {
	var mu sync.Mutex
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&lockedWriter{mu: &mu, buf: &buf},
		&slog.HandlerOptions{Level: slog.LevelDebug}))

	source := &slowOnce{name: "imdb", delay: 250 * time.Millisecond}
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	})
	reg.Register(source)

	p := NewWithFetcher(reg, &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})})
	p.logger = logger
	p.SetRatingsCacheTTL(time.Hour)
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))
	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	cfg.Ratings = []string{"imdb"}

	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = p.Render(context.Background(), Request{
				MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg,
			})
		}()
	}
	wg.Wait()

	source.mu.Lock()
	calls := source.calls
	source.mu.Unlock()
	if calls >= 4 {
		t.Skipf("the renders did not overlap (%d fetches), so nothing was shared", calls)
	}

	mu.Lock()
	out := buf.String()
	mu.Unlock()
	if !bytes.Contains([]byte(out), []byte(sharedFetchMsg)) {
		t.Errorf("%d renders shared %d fetches and none was reported as waited on", 4, calls)
	}
}

type lockedWriter struct {
	mu  *sync.Mutex
	buf *bytes.Buffer
}

func (w *lockedWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.buf.Write(p)
}

// A render that did the fetch itself is not reported as having waited.
func TestALeaderIsNotReportedAsWaiting(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	})
	reg.Register(&answering{name: "imdb"})

	p := &Pipeline{providers: reg, logger: logger,
		fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))
	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	cfg.Ratings = []string{"imdb"}

	if _, err := p.Render(context.Background(), Request{
		MediaType: "poster", ContentType: "movie", MediaID: "tt2", Config: cfg,
	}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if bytes.Contains(buf.Bytes(), []byte(sharedFetchMsg)) {
		t.Error("a render that fetched for itself was reported as waiting on another")
	}
}
