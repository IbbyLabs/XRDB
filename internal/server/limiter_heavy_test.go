package server

import (
	"context"
	"sort"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// openRow sends n heavy renders at once against a 7-at-a-time budget, each
// rendering for hold, and counts how many are admitted.
func openRow(l *concurrencyLimiter, n int, hold time.Duration, admit func() bool) int {
	var admitted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if admit() {
				admitted.Add(1)
				time.Sleep(hold)
				l.release(heavyWeight)
			}
		}()
	}
	wg.Wait()
	return int(admitted.Load())
}

// A 4K caller opening a row no longer sheds the part of it the ordinary wait cannot reach.
func TestAHeavyRowIsAdmittedInsideTheLongerWait(t *testing.T) {
	const n, hold, first = 40, 100 * time.Millisecond, 250 * time.Millisecond

	plain := newConcurrencyLimiter(256)
	shedToday := n - openRow(plain, n, hold, func() bool {
		return plain.acquireWithin(context.Background(), first, heavyWeight)
	})
	if shedToday == 0 {
		t.Fatal("fixture no longer sheds with the ordinary wait, so the test below shows nothing")
	}

	heavy := newConcurrencyLimiter(256)
	got := openRow(heavy, n, hold, func() bool {
		ok, _ := heavy.acquireHeavy(context.Background(), first, 2*time.Second, heavyWeight)
		return ok
	})
	if got != n {
		t.Errorf("admitted %d of %d heavy renders, the ordinary wait shed %d", got, n, shedToday)
	}
}

// lightStream keeps a 1080p waiter queued most of the time until stop closes,
// and returns each light render's wait.
func lightStream(l *concurrencyLimiter, stop <-chan struct{}) func() []time.Duration {
	var mu sync.Mutex
	var waits []time.Duration
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			case <-time.After(time.Millisecond):
			}
			wg.Add(1)
			go func() {
				defer wg.Done()
				start := time.Now()
				if l.acquireWithin(context.Background(), time.Second, weightUnit) {
					mu.Lock()
					waits = append(waits, time.Since(start))
					mu.Unlock()
					time.Sleep(15 * time.Millisecond)
					l.release(weightUnit)
				}
			}()
		}
	}()
	return func() []time.Duration { wg.Wait(); mu.Lock(); defer mu.Unlock(); return waits }
}

// fullStream runs workers 1080p callers in a loop, each queueing again as soon
// as it releases, until stop closes. More workers than budget units keeps a
// waiter queued at any machine speed. It returns each render's wait.
func fullStream(l *concurrencyLimiter, workers int, stop <-chan struct{}) func() []time.Duration {
	var mu sync.Mutex
	var waits []time.Duration
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				start := time.Now()
				if l.acquireWithin(context.Background(), time.Second, weightUnit) {
					mu.Lock()
					waits = append(waits, time.Since(start))
					mu.Unlock()
					time.Sleep(15 * time.Millisecond)
					l.release(weightUnit)
				}
			}
		}()
	}
	return func() []time.Duration { wg.Wait(); mu.Lock(); defer mu.Unlock(); return waits }
}

func p95(ds []time.Duration) time.Duration {
	if len(ds) == 0 {
		return 0
	}
	sort.Slice(ds, func(i, j int) bool { return ds[i] < ds[j] })
	return ds[len(ds)*95/100]
}

// A steady 1080p stream must not starve the 4K render, and the 4K render must
// not hold the stream back by more than its bounded join.
func TestAHeavyRenderGetsInUnderASteadyLightStream(t *testing.T) {
	// A 64-unit budget the light stream keeps full, with a waiter always queued.
	run := func(heavy func(*concurrencyLimiter) bool) (admitted bool, lightP95 time.Duration) {
		l := newConcurrencyLimiter(64)
		stop := make(chan struct{})
		waits := fullStream(l, 72, stop)
		time.Sleep(50 * time.Millisecond)
		if heavy != nil {
			admitted = heavy(l)
			if admitted {
				time.Sleep(50 * time.Millisecond)
				l.release(heavyWeight)
			}
		} else {
			time.Sleep(600 * time.Millisecond)
		}
		close(stop)
		return admitted, p95(waits())
	}

	_, baseline := run(nil)
	// Control: polling that stands aside for any queued waiter is starved here,
	// so it must lose most of five.
	got := 0
	for i := 0; i < 5; i++ {
		if in, _ := run(func(l *concurrencyLimiter) bool {
			return l.acquireBulk(context.Background(), 1500*time.Millisecond, heavyWeight)
		}); in {
			got++
		}
	}
	if got >= 3 {
		t.Fatalf("plain polling got in %d of 5 runs: the fixture no longer keeps a waiter queued, so the test below shows nothing", got)
	}
	admitted, withHeavy := run(func(l *concurrencyLimiter) bool {
		ok, _ := l.acquireHeavy(context.Background(), 50*time.Millisecond, 1500*time.Millisecond, heavyWeight)
		return ok
	})
	if !admitted {
		t.Fatal("the heavy render was starved by the light stream")
	}
	if withHeavy > baseline+heavyJoinWait+50*time.Millisecond {
		t.Errorf("light p95 wait %v with the heavy render, %v without; more than the bounded join", withHeavy, baseline)
	}
}

// Phase two ends when the caller does.
func TestAHeavyRenderStopsPollingWhenTheCallerLeaves(t *testing.T) {
	l := newConcurrencyLimiter(36)
	if !l.acquire(context.Background(), 36) {
		t.Fatal("could not fill the budget")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	start := time.Now()
	ok, _ := l.acquireHeavy(ctx, 50*time.Millisecond, 5*time.Second, heavyWeight)
	if ok || time.Since(start) > time.Second {
		t.Errorf("admitted %v after %v; want a refusal soon after the caller left", ok, time.Since(start))
	}
}

// A whole 4K row polling at once takes turns at the head of the queue, so a
// 1080p browser beside it is held back by one join, not forty.
func TestAHeavyRowDoesNotStackUpAtTheHeadOfTheQueue(t *testing.T) {
	l := newConcurrencyLimiter(256)
	stop := make(chan struct{})
	waits := lightStream(l, stop)
	time.Sleep(50 * time.Millisecond)
	var wg sync.WaitGroup
	var admitted atomic.Int32
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, _ := l.acquireHeavy(context.Background(), 50*time.Millisecond, 3*time.Second, heavyWeight); ok {
				admitted.Add(1)
				time.Sleep(100 * time.Millisecond)
				l.release(heavyWeight)
			}
		}()
	}
	wg.Wait()
	close(stop)
	light := p95(waits())
	if admitted.Load() != 40 {
		t.Errorf("admitted %d of 40", admitted.Load())
	}
	if light > 150*time.Millisecond {
		t.Errorf("light p95 wait %v beside a polling 4K row, want under 150ms", light)
	}
}
