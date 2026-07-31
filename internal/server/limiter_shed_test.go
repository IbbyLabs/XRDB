package server

import (
	"context"
	"testing"
	"time"
)

// A burst that outruns render throughput used to queue without bound, which is
// how a short catalogue burst turned into 144-second renders for everyone behind
// it. A full queue must give up quickly instead.
func TestAFullQueueShedsInsteadOfWaitingForever(t *testing.T) {
	l := newConcurrencyLimiter(1)
	if !l.acquire(context.Background()) {
		t.Fatal("first acquire should take the only slot")
	}

	start := time.Now()
	if l.acquireWithin(context.Background(), 80*time.Millisecond) {
		t.Fatal("acquired a slot that was already held")
	}
	waited := time.Since(start)
	if waited > 800*time.Millisecond {
		t.Errorf("waited %v before shedding; the queue is still effectively unbounded", waited)
	}

	// Freeing the slot lets the next caller straight through.
	l.release()
	if !l.acquireWithin(context.Background(), time.Second) {
		t.Error("a freed slot was not handed to the next caller")
	}
}

// Zero keeps the old behaviour, so the shed can be turned off in an emergency.
func TestZeroWaitKeepsTheUnboundedBehaviour(t *testing.T) {
	l := newConcurrencyLimiter(1)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond)
	defer cancel()
	if !l.acquire(context.Background()) {
		t.Fatal("first acquire failed")
	}
	if l.acquireWithin(ctx, 0) {
		t.Error("acquired a held slot")
	}
	if ctx.Err() == nil {
		t.Error("with wait 0 it should have blocked until the context expired, not returned early")
	}
}
