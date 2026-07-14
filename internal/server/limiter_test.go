package server

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestConcurrencyLimiterBoundsInFlight(t *testing.T) {
	const limit = 3
	const workers = 30
	l := newConcurrencyLimiter(limit)

	var inFlight, maxInFlight int32
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if !l.acquire(context.Background()) {
				t.Errorf("acquire returned false with a background context")
				return
			}
			cur := atomic.AddInt32(&inFlight, 1)
			for {
				m := atomic.LoadInt32(&maxInFlight)
				if cur <= m || atomic.CompareAndSwapInt32(&maxInFlight, m, cur) {
					break
				}
			}
			time.Sleep(time.Millisecond)
			atomic.AddInt32(&inFlight, -1)
			l.release()
		}()
	}
	wg.Wait()

	if maxInFlight > limit {
		t.Fatalf("in-flight peaked at %d, want <= %d", maxInFlight, limit)
	}
}

func TestConcurrencyLimiterAbortsWhenSaturated(t *testing.T) {
	l := newConcurrencyLimiter(1)
	if !l.acquire(context.Background()) {
		t.Fatal("first acquire should succeed")
	}
	// The only slot is taken; a done context must abort rather than block.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if l.acquire(ctx) {
		t.Fatal("acquire should return false when saturated and ctx is done")
	}
	l.release()
}

func TestNilConcurrencyLimiterIsUnbounded(t *testing.T) {
	var l *concurrencyLimiter // n <= 0 path
	if got := newConcurrencyLimiter(0); got != nil {
		t.Fatalf("newConcurrencyLimiter(0) = %v, want nil", got)
	}
	if !l.acquire(context.Background()) {
		t.Fatal("nil limiter acquire should always return true")
	}
	l.release() // must not panic
}
