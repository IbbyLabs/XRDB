package server

import (
	"context"
	"testing"
	"time"
)

// The shed line reports what the budget was holding, so occupancy has to track
// every path that takes a slot and every one that gives it back. acquireWithin
// and acquireBulk both delegate to acquire when no wait is given, which is where
// a double count would hide.
func TestOccupancyTracksEveryAcquirePath(t *testing.T) {
	cases := []struct {
		name string
		take func(l *concurrencyLimiter, w int64) bool
	}{
		{"acquire", func(l *concurrencyLimiter, w int64) bool {
			return l.acquire(context.Background(), w)
		}},
		{"acquireWithin", func(l *concurrencyLimiter, w int64) bool {
			return l.acquireWithin(context.Background(), time.Second, w)
		}},
		{"acquireWithin no wait", func(l *concurrencyLimiter, w int64) bool {
			return l.acquireWithin(context.Background(), 0, w)
		}},
		{"acquireBulk", func(l *concurrencyLimiter, w int64) bool {
			return l.acquireBulk(context.Background(), time.Second, w)
		}},
		{"acquireBulk no wait", func(l *concurrencyLimiter, w int64) bool {
			return l.acquireBulk(context.Background(), 0, w)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			l := newConcurrencyLimiter(16)
			if held, budget := l.occupancy(); held != 0 || budget != 16 {
				t.Fatalf("before: held=%d budget=%d, want 0 and 16", held, budget)
			}
			if !tc.take(l, 3) {
				t.Fatal("acquire refused a free limiter")
			}
			if held, _ := l.occupancy(); held != 3 {
				t.Errorf("after acquiring 3: held=%d, want 3", held)
			}
			l.release(3)
			if held, _ := l.occupancy(); held != 0 {
				t.Errorf("after release: held=%d, want 0", held)
			}
		})
	}
}

// A refused acquire must not leave weight behind, or the next shed line reports
// a budget held by a render that never ran.
func TestOccupancyUnchangedByARefusedAcquire(t *testing.T) {
	l := newConcurrencyLimiter(4)
	if !l.acquire(context.Background(), 4) {
		t.Fatal("could not fill the limiter")
	}
	if l.acquireWithin(context.Background(), 20*time.Millisecond, 1) {
		t.Fatal("a full limiter admitted another render")
	}
	if held, _ := l.occupancy(); held != 4 {
		t.Errorf("held=%d after a refusal, want 4", held)
	}
}

// Weight is clamped to the capacity on the way in, so it has to be clamped the
// same way on the way out or occupancy drifts down on every oversized render.
func TestOccupancyReturnsToZeroForAnOversizedRender(t *testing.T) {
	l := newConcurrencyLimiter(4)
	if !l.acquire(context.Background(), 99) {
		t.Fatal("an oversized render was refused by an empty limiter")
	}
	if held, _ := l.occupancy(); held != 4 {
		t.Errorf("held=%d, want the capacity 4", held)
	}
	l.release(99)
	if held, _ := l.occupancy(); held != 0 {
		t.Errorf("held=%d after releasing an oversized render, want 0", held)
	}
}

func TestOccupancyOfANilLimiter(t *testing.T) {
	var l *concurrencyLimiter
	if held, budget := l.occupancy(); held != 0 || budget != 0 {
		t.Errorf("nil limiter: held=%d budget=%d, want 0 and 0", held, budget)
	}
}
