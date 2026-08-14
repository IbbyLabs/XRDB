package server

import (
	"context"
	"testing"
	"time"
)

// A sweep is turned away only after a much longer wait than a person would be
// given. With the budget full and nothing freeing, bulk holds on rather than
// shedding at the interactive deadline.
func TestBulkWaitsRatherThanShedding(t *testing.T) {
	l := newConcurrencyLimiter(1)
	if !l.acquire(context.Background(), 1) {
		t.Fatal("could not take the only slot")
	}

	start := time.Now()
	admitted := l.acquireBulk(context.Background(), 400*time.Millisecond, 1)
	elapsed := time.Since(start)

	if admitted {
		t.Fatal("admitted while the only slot was held")
	}
	if elapsed < 350*time.Millisecond {
		t.Fatalf("bulk gave up after %v, well before its budget", elapsed)
	}
}

// The point of the change, tested where the two behaviours actually differ.
//
// Capacity is 3 with 2 held, so one unit is free. An interactive caller wants 2
// and cannot fit, so it queues. A bulk caller wants 1 and could fit. It must
// stand aside: taking that unit is what keeps the interactive caller waiting for
// a request nobody is watching.
func TestBulkLeavesAFreeSlotForAQueuedInteractiveCaller(t *testing.T) {
	l := newConcurrencyLimiter(3)
	if !l.acquire(context.Background(), 2) {
		t.Fatal("could not take the first two units")
	}

	interactiveQueued := make(chan struct{})
	go func() {
		close(interactiveQueued)
		l.acquireWithin(context.Background(), 3*time.Second, 2)
	}()
	<-interactiveQueued
	// Let it reach the semaphore's wait queue before asking whether bulk
	// respects it. Without a queued caller this test proves nothing, so the
	// control below checks bulk does take the unit when none is waiting.
	time.Sleep(100 * time.Millisecond)

	if l.acquireBulk(context.Background(), 400*time.Millisecond, 1) {
		t.Fatal("bulk took the free unit while an interactive caller was queued")
	}
}

// The control for the test above. Same shape, same free unit, no interactive
// caller queued, and bulk takes it. Without this, a bulk path that never
// acquires anything would pass the test above for the wrong reason.
func TestBulkTakesTheSameFreeSlotWhenNobodyIsQueued(t *testing.T) {
	l := newConcurrencyLimiter(3)
	if !l.acquire(context.Background(), 2) {
		t.Fatal("could not take the first two units")
	}
	if !l.acquireBulk(context.Background(), 400*time.Millisecond, 1) {
		t.Fatal("bulk did not take a free unit with nobody queued")
	}
	l.release(1)
	l.release(2)
}

// Standing aside must not mean never running. With no interactive caller in
// sight, a sweep takes a free slot promptly.
func TestBulkIsAdmittedWhenNobodyIsWaiting(t *testing.T) {
	l := newConcurrencyLimiter(2)

	start := time.Now()
	if !l.acquireBulk(context.Background(), 2*time.Second, 1) {
		t.Fatal("bulk was not admitted to an idle limiter")
	}
	if elapsed := time.Since(start); elapsed > 500*time.Millisecond {
		t.Fatalf("bulk took %v to enter an idle limiter", elapsed)
	}
	l.release(1)
}

// A caller that hangs up stops waiting, and must not leave a slot taken.
func TestBulkAbandonsOnACancelledRequest(t *testing.T) {
	l := newConcurrencyLimiter(1)
	if !l.acquire(context.Background(), 1) {
		t.Fatal("could not take the only slot")
	}
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()
	if l.acquireBulk(ctx, 10*time.Second, 1) {
		t.Fatal("admitted after the caller went away")
	}
	l.release(1)
	if !l.acquire(context.Background(), 1) {
		t.Fatal("the slot was not free, so the abandoned wait held one")
	}
}

// The starvation this change exists to remove.
//
// One unit is free. A heavy sweep wants the whole budget and cannot fit, and it
// asks first. A light interactive request arrives after and would fit in the
// free unit. Joining the semaphore's queue would put the sweep at its head and
// hold the interactive request behind a reservation it does not need to wait
// for; polling leaves the queue empty, so the interactive request goes straight
// through.
func TestAHeavySweepDoesNotBlockALighterRequestBehindIt(t *testing.T) {
	l := newConcurrencyLimiter(3)
	if !l.acquire(context.Background(), 2) {
		t.Fatal("could not take the first two units")
	}

	bulkAsking := make(chan struct{})
	go func() {
		close(bulkAsking)
		l.acquireBulk(context.Background(), 3*time.Second, 3)
	}()
	<-bulkAsking
	time.Sleep(150 * time.Millisecond)

	admitted := make(chan bool, 1)
	go func() {
		admitted <- l.acquireWithin(context.Background(), time.Second, 1)
	}()

	select {
	case ok := <-admitted:
		if !ok {
			t.Fatal("the interactive request was held behind the sweep")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the interactive request never returned")
	}
}
