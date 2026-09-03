package provider

import (
	"context"
	"errors"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/testutil"
)

// waitBudget is paid only by a failing run. A polling wait returns as soon as
// its condition holds.
const waitBudget = 30 * time.Second

// waitFor polls until cond holds or the budget runs out. The failure reports
// elapsed time and poll count: elapsed far above the budget on few polls is the
// process losing the CPU, and elapsed at the budget on many polls is a condition
// that never held.
func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	start := time.Now()
	polls := 0
	for time.Since(start) < waitBudget {
		polls++
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s after %v and %d polls",
		what, time.Since(start).Round(time.Millisecond), polls)
}

// The ranking streams a dataset far larger than the ratings file, so it
// routinely outlives the request that triggered it. Tying it to that request's
// context means a client that hangs up first takes the ranking with it.
func TestTopRatedSurvivesTheTriggeringRequest(t *testing.T) {
	dir := t.TempDir()
	writeFakeTSV(t, dir)

	released := make(chan struct{})
	d := NewIMDbDataset(dir)
	d.topRatedEnabled = true
	d.httpClient = &http.Client{Transport: testutil.RoundTripperFunc(func(r *http.Request) (*http.Response, error) {
		// Answer only once the triggering request is over, which is the ordering
		// that matters and the one a real build hits.
		select {
		case <-released:
		case <-r.Context().Done():
			return nil, r.Context().Err()
		case <-time.After(5 * time.Second):
			return nil, errors.New("basics fetch was never released")
		}
		return basicsResponse(t, [][2]string{{"tt0468569", "movie"}}), nil
	})}

	ctx, cancel := context.WithCancel(context.Background())
	if _, err := d.Fetch(ctx, "movie", "tt0468569"); err != nil {
		t.Fatalf("fetch: %v", err)
	}
	// The caller is gone; the ranking it kicked off is not.
	cancel()
	close(released)

	waitFor(t, "the ranking to build", d.TopRatedReady)

	meta, err := d.Fetch(context.Background(), "movie", "tt0468569")
	if err != nil {
		t.Fatalf("second fetch: %v", err)
	}
	if meta.TopRatedRank == 0 {
		t.Fatal("rank is absent from a render after the ranking built")
	}
}

// The dataset load runs once, so a ranking that failed during it would wait for
// the weekly refresh unless something else asks again.
func TestTopRatedIsAttemptedAgainAfterAFailure(t *testing.T) {
	dir := t.TempDir()
	writeFakeTSV(t, dir)

	var calls atomic.Int32
	d := NewIMDbDataset(dir)
	d.topRatedEnabled = true
	d.httpClient = &http.Client{Transport: testutil.RoundTripperFunc(func(*http.Request) (*http.Response, error) {
		if calls.Add(1) == 1 {
			return nil, errors.New("imdb is having a moment")
		}
		return basicsResponse(t, [][2]string{{"tt0468569", "movie"}}), nil
	})}

	if _, err := d.Fetch(context.Background(), "movie", "tt0468569"); err != nil {
		t.Fatalf("fetch: %v", err)
	}
	waitFor(t, "the first attempt to fail", func() bool {
		d.mu.RLock()
		defer d.mu.RUnlock()
		return calls.Load() == 1 && !d.rankBuilding
	})
	if d.TopRatedReady() {
		t.Fatal("ranking reported ready after a failed build")
	}

	// Clear the wait the failure set, as a refresh does.
	d.mu.Lock()
	d.rankAttempt = time.Time{}
	d.mu.Unlock()

	if _, err := d.Fetch(context.Background(), "movie", "tt0468569"); err != nil {
		t.Fatalf("later fetch: %v", err)
	}
	waitFor(t, "the ranking to build on the second attempt", d.TopRatedReady)
}

// A failed build must not be retried by every request that follows it.
func TestTopRatedDoesNotRetryOnEveryRequest(t *testing.T) {
	dir := t.TempDir()
	writeFakeTSV(t, dir)

	var calls atomic.Int32
	d := NewIMDbDataset(dir)
	d.topRatedEnabled = true
	d.httpClient = &http.Client{Transport: testutil.RoundTripperFunc(func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		return nil, errors.New("imdb is having a moment")
	})}

	if _, err := d.Fetch(context.Background(), "movie", "tt0468569"); err != nil {
		t.Fatalf("fetch: %v", err)
	}
	// The build has to have finished before the next requests, or they find one
	// in flight and the wait is never the thing under test.
	waitFor(t, "the first attempt to finish", func() bool {
		d.mu.RLock()
		defer d.mu.RUnlock()
		return calls.Load() == 1 && !d.rankBuilding
	})

	for range 4 {
		if _, err := d.Fetch(context.Background(), "movie", "tt0468569"); err != nil {
			t.Fatalf("fetch: %v", err)
		}
	}
	time.Sleep(100 * time.Millisecond)
	if n := calls.Load(); n != 1 {
		t.Fatalf("basics fetched %d times, want 1", n)
	}
}
