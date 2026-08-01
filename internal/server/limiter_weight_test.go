package server

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
)

func TestAHeavyRenderCostsMoreOfTheBudget(t *testing.T) {
	l := newConcurrencyLimiter(10)
	ctx := context.Background()

	if !l.acquire(ctx, renderWeight(imageconfig.Size4K)) {
		t.Fatal("the first 4K render should fit in a budget of 10")
	}
	// 7 of 10 spent, so three ordinary renders still fit and a second 4K does not.
	for i := 0; i < 3; i++ {
		if !l.acquire(ctx, renderWeight("")) {
			t.Fatalf("ordinary render %d should still fit alongside a 4K one", i+1)
		}
	}
	if l.acquireWithin(ctx, 20*time.Millisecond, renderWeight(imageconfig.Size4K)) {
		t.Fatal("a second 4K render should wait rather than take a full budget's worth")
	}
}

// Under the old unweighted limiter twenty 4K renders ran at once, which is what
// let a catalogue crawl take the whole box.
func TestOrdinaryRendersAreNotThrottledByTheWeighting(t *testing.T) {
	l := newConcurrencyLimiter(10)
	ctx := context.Background()
	for i := 0; i < 10; i++ {
		if !l.acquire(ctx, renderWeight(imageconfig.SizeNormal)) {
			t.Fatalf("ordinary render %d should fit: they weigh one each", i+1)
		}
	}
}

// A weight above the whole budget would never be satisfiable, so it is clamped
// rather than left to block for ever.
func TestAWeightLargerThanTheBudgetStillRuns(t *testing.T) {
	l := newConcurrencyLimiter(2)
	if !l.acquireWithin(context.Background(), time.Second, renderWeight(imageconfig.Size4K)) {
		t.Fatal("a 4K render must still run on a small budget, not deadlock")
	}
	l.release(renderWeight(imageconfig.Size4K))
	if !l.acquireWithin(context.Background(), time.Second, 1) {
		t.Fatal("the clamped weight must be released in full")
	}
}
