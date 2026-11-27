package compose

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "i/o timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

// slowFailer takes its own request timeout to fail, as a stalled upstream does.
type slowFailer struct {
	name  string
	delay time.Duration
	calls atomic.Int32
}

func (s *slowFailer) Name() string { return s.name }

func (s *slowFailer) Fetch(ctx context.Context, _, _ string) (*provider.MediaMeta, error) {
	s.calls.Add(1)
	select {
	case <-time.After(s.delay):
		return nil, fmt.Errorf("%s: request: %w", s.name, timeoutErr{})
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// Below the failure span the breaker is open to every render: each one pays its
// own request timeout in parallel instead of queueing behind a hold.
func TestRendersKeepTheirOwnTimeoutWhileTheBreakerIsInsideItsSpan(t *testing.T) {
	const renders = 8
	src := &slowFailer{name: "mdblist", delay: 100 * time.Millisecond}
	h := provider.NewHealthTracker(10, time.Hour)
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(h)

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"mdblist"}

	start := time.Now()
	var wg sync.WaitGroup
	for i := range renders {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := Request{MediaType: "poster", ContentType: "movie", MediaID: fmt.Sprintf("tt%d", i), Config: cfg}
			p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
		}()
	}
	wg.Wait()
	elapsed := time.Since(start)

	if got := src.calls.Load(); got != renders {
		t.Errorf("source called %d times, want %d: renders were held out by the breaker", got, renders)
	}
	if elapsed > 5*src.delay {
		t.Errorf("%d renders took %s, want about one timeout (%s): they queued behind each other", renders, elapsed, src.delay)
	}
	if h.CoolingOff("mdblist", provider.CallerInteractive) {
		t.Error("one stall inside the span held the source out")
	}
}
