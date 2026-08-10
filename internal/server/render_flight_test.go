package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/provider"
)

// countingFetcher answers like fixedFetcher but records how much work was done
// and takes long enough that concurrent requests genuinely overlap.
type countingFetcher struct {
	data  []byte
	delay time.Duration
	calls atomic.Int64
}

func (f *countingFetcher) Fetch(context.Context, string) ([]byte, error) {
	f.calls.Add(1)
	time.Sleep(f.delay)
	return f.data, nil
}

func flightHandler(t *testing.T, f *countingFetcher) http.Handler {
	t.Helper()
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	})
	c, err := cache.New(filepath.Join(t.TempDir(), "cache"), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatalf("cache.New: %v", err)
	}
	t.Cleanup(c.Close)
	return NewHandler("test", nil, nil, compose.NewWithFetcher(reg, f), c, config.Config{})
}

// Nothing is stored until a render finishes, so simultaneous requests for one
// uncached image all miss the cache. Each used to take its own queue slot and
// produce the same bytes, which is what multiplies occupancy during a
// catalogue sweep (BUG-241).
func TestConcurrentRequestsForOneKeyRenderOnce(t *testing.T) {
	const concurrent = 8
	const url = "/poster/tt0816692"

	// The cost of a single render, measured rather than assumed: a render may
	// fetch more than one URL, so the baseline is what one is allowed to spend.
	solo := &countingFetcher{data: testSourcePNG(t, 400, 600), delay: 40 * time.Millisecond}
	rr := httptest.NewRecorder()
	flightHandler(t, solo).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, url, nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("the baseline render failed: %d", rr.Code)
	}
	baseline := solo.calls.Load()
	if baseline == 0 {
		t.Fatal("the baseline render fetched nothing, so this test can measure nothing")
	}

	shared := &countingFetcher{data: testSourcePNG(t, 400, 600), delay: 120 * time.Millisecond}
	h := flightHandler(t, shared)
	codes := make([]int, concurrent)
	var wg sync.WaitGroup
	for i := 0; i < concurrent; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, url, nil))
			codes[i] = w.Code
			if w.Code == http.StatusOK && w.Body.Len() == 0 {
				t.Errorf("request %d got 200 with an empty body", i)
			}
		}(i)
	}
	wg.Wait()

	for i, c := range codes {
		if c != http.StatusOK {
			t.Errorf("request %d got %d, want 200 — a shared render must answer every waiter", i, c)
		}
	}
	if got := shared.calls.Load(); got > baseline {
		t.Errorf("%d concurrent requests for one key cost %d fetches against %d for a single render",
			concurrent, got, baseline)
	}
}

// A waiter that gives up must not take the leader's result with it, and the
// leader must still finish for everyone else.
func TestAWaiterGivingUpDoesNotCancelTheRender(t *testing.T) {
	f := &countingFetcher{data: testSourcePNG(t, 400, 600), delay: 150 * time.Millisecond}
	h := flightHandler(t, f)
	const url = "/poster/tt1375666"

	var wg sync.WaitGroup
	wg.Add(1)
	var leaderCode int
	go func() {
		defer wg.Done()
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, url, nil))
		leaderCode = w.Code
	}()

	time.Sleep(30 * time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	wg.Add(1)
	go func() {
		defer wg.Done()
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, url, nil).WithContext(ctx))
	}()
	time.Sleep(20 * time.Millisecond)
	cancel()
	wg.Wait()

	if leaderCode != http.StatusOK {
		t.Errorf("the leader answered %d after a waiter gave up, want 200", leaderCode)
	}
}

// A key with no render under way must not be held after the leader finishes, or
// the map grows for the life of the process.
func TestTheFlightMapEmptiesAfterEachRender(t *testing.T) {
	f := &countingFetcher{data: testSourcePNG(t, 400, 600)}
	h := flightHandler(t, f)
	for _, id := range []string{"tt0111161", "tt0068646", "tt0071562"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/poster/"+id, nil))
	}
	flight := newRenderFlight()
	if n := flight.inFlight(); n != 0 {
		t.Errorf("a fresh flight reports %d in flight", n)
	}
	call, leader := flight.begin("k")
	if !leader {
		t.Fatal("the first caller for a key is not the leader")
	}
	if n := flight.inFlight(); n != 1 {
		t.Errorf("in flight %d during a render, want 1", n)
	}
	if _, second := flight.begin("k"); second {
		t.Error("a second caller for the same key also led it")
	}
	flight.finish("k", call)
	if n := flight.inFlight(); n != 0 {
		t.Errorf("in flight %d after finishing, want 0", n)
	}
	select {
	case <-call.done:
	default:
		t.Error("finish did not release the waiters")
	}
}
