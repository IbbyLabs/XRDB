package provider

import (
	"context"
	"testing"
	"time"
)

// A refusal is a subtraction the log has to carry: a band a fraction too slow
// and one saturated by an order of magnitude produce the same gate.
func TestAGovernorRefusalReportsHowFarOverBudgetItWas(t *testing.T) {
	g := newBudgetGovernor("mdblist")
	// Drain the ceiling directly: an unbounded claim never refuses and never
	// sleeps, so the bucket empties without the test waiting for it.
	for range 200 {
		g.takeCeiling(0, false)
	}

	ctx, cancel := context.WithTimeout(context.Background(), minCallBudget+10*time.Millisecond)
	defer cancel()
	err := g.wait(ctx)
	if err == nil {
		t.Fatal("a drained ceiling admitted a call with almost no budget")
	}
	wait, budget, ok := HoldOutWait(err)
	if !ok {
		t.Fatal("the refusal carried no wait, so nothing says how far over it was")
	}
	if wait <= budget {
		t.Errorf("wait %v should exceed budget %v on a refusal", wait, budget)
	}
	if HoldOutReason(err) == "" {
		t.Error("the refusal lost its paced_by")
	}
}

// A call that is admitted carries no overshoot to report.
func TestAnAdmittedCallReportsNoOvershoot(t *testing.T) {
	g := newBudgetGovernor("mdblist")
	ctx, cancel := context.WithTimeout(context.Background(), time.Hour)
	defer cancel()
	if err := g.wait(ctx); err != nil {
		t.Fatalf("first call refused: %v", err)
	}
	if _, _, ok := HoldOutWait(nil); ok {
		t.Error("a nil error reported an overshoot")
	}
}
