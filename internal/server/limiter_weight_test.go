package server

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
)

func TestAHeavyRenderCostsMoreOfTheBudget(t *testing.T) {
	// Sized the way the handler sizes it: the budget is in weight units and a
	// normal poster costs weightUnit of them.
	l := newConcurrencyLimiter(10 * weightUnit)
	ctx := context.Background()

	if !l.acquireWithin(ctx, time.Second, renderWeight("poster", imageconfig.Size4K)) {
		t.Fatal("the first 4K render should fit in a budget of ten posters")
	}
	// 36 of 40 spent, so one ordinary render still fits and a second 4K does not.
	if !l.acquireWithin(ctx, time.Second, renderWeight("poster", "")) {
		t.Fatal("an ordinary render should still fit alongside a 4K one")
	}
	if l.acquireWithin(ctx, 20*time.Millisecond, renderWeight("poster", imageconfig.Size4K)) {
		t.Fatal("a second 4K render should wait rather than take a full budget's worth")
	}
}

// Under the old unweighted limiter twenty 4K renders ran at once, which is what
// let a catalogue crawl take the whole box.
func TestOrdinaryRendersAreNotThrottledByTheWeighting(t *testing.T) {
	l := newConcurrencyLimiter(10 * weightUnit)
	ctx := context.Background()
	for i := 0; i < 10; i++ {
		if !l.acquireWithin(ctx, time.Second, renderWeight("poster", imageconfig.SizeNormal)) {
			t.Fatalf("ordinary render %d should fit: they weigh one each", i+1)
		}
	}
}

// A weight above the whole budget would never be satisfiable, so it is clamped
// rather than left to block for ever.
func TestAWeightLargerThanTheBudgetStillRuns(t *testing.T) {
	l := newConcurrencyLimiter(2)
	if !l.acquireWithin(context.Background(), time.Second, renderWeight("poster", imageconfig.Size4K)) {
		t.Fatal("a 4K render must still run on a small budget, not deadlock")
	}
	l.release(renderWeight("poster", imageconfig.Size4K))
	if !l.acquireWithin(context.Background(), time.Second, 1) {
		t.Fatal("the clamped weight must be released in full")
	}
}
