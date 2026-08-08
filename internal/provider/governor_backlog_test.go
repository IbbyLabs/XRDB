package provider

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"
)

// The client timeout covers the queue in front of a source as well as the call.
// A request left to sleep through it is cancelled inside our own queue and comes
// back as the source timing out, which five times over holds a healthy source
// off every poster.
func TestTheGovernorRefusesAWaitLongerThanTheRequestHasLeft(t *testing.T) {
	g := newBudgetGovernor("mdblist")
	g.rate = 0.05 // 20s a token
	for range int(g.burst) + 1 {
		g.take(-1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	start := time.Now()
	err := g.wait(ctx)
	if !errors.Is(err, ErrGovernorBacklog) {
		t.Fatalf("wait = %v, want ErrGovernorBacklog", err)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("the refusal took %s; it slept instead of refusing", elapsed)
	}
	if got := HoldOutGate(err); got != GateGovernorBacklog {
		t.Errorf("HoldOutGate = %q, want %q", got, GateGovernorBacklog)
	}
}

// A refused request must not claim the slot it will not use, or the queue behind
// it pays for a request that never went out.
func TestARefusedRequestDoesNotClaimASlot(t *testing.T) {
	g := newBudgetGovernor("mdblist")
	g.rate = 0.05
	for range int(g.burst) + 1 {
		g.take(-1)
	}
	before := g.tokens

	if _, ok := g.take(time.Second); ok {
		t.Fatal("a wait far past the budget was allowed")
	}
	// The bucket still refills with elapsed time; what must not happen is the
	// claim, which costs a whole token.
	if g.tokens < before-0.5 {
		t.Errorf("a refused request claimed a slot: balance went from %v to %v", before, g.tokens)
	}

	// Control: an allowed claim does move it, so the check above can fail.
	before = g.tokens
	if _, ok := g.take(-1); !ok {
		t.Fatal("an unbounded claim was refused")
	}
	if g.tokens > before-0.5 {
		t.Errorf("an allowed claim did not cost a slot: balance went from %v to %v", before, g.tokens)
	}
}

// A wait that fits inside what the request has left is still taken: the pacing
// is the point, and refusing everything would shed the load it exists to spread.
func TestAWaitThatFitsIsStillTaken(t *testing.T) {
	g := newBudgetGovernor("mdblist")
	g.rate = 5
	for range int(g.burst) + 1 {
		g.take(-1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := g.wait(ctx); err != nil {
		t.Errorf("a wait of about 200ms against a 10s budget was refused: %v", err)
	}
}

// A request with no deadline is not refused: nothing is going to cancel it.
func TestAnUnboundedRequestIsNotRefused(t *testing.T) {
	g := newBudgetGovernor("mdblist")
	g.rate = 0.05
	for range int(g.burst) + 1 {
		g.take(-1)
	}
	g.sleep = func(time.Duration, <-chan struct{}) error { return nil }
	if err := g.wait(context.Background()); err != nil {
		t.Errorf("a request with no deadline was refused: %v", err)
	}
}

// End to end: the shape production saw. A starved governor behind a short client
// timeout used to return "Client.Timeout exceeded", which reads as the source
// failing. It must name our own queue instead.
func TestAStarvedGovernorRefusesInsteadOfTimingOut(t *testing.T) {
	g := newBudgetGovernor("mdblist")
	g.rate = 0.05
	for range int(g.burst) + 1 {
		g.take(-1)
	}
	c := &http.Client{
		Timeout: 2 * time.Second,
		Transport: &throttledTransport{
			base:     &headerTransport{header: make(http.Header)},
			source:   "mdblist",
			policy:   RateLimit{MaxRetries: 0},
			pacer:    &pacer{},
			governor: g,
		},
	}
	start := time.Now()
	_, err := c.Get("http://example.invalid/x")
	if err == nil {
		t.Fatal("the request went out")
	}
	if !errors.Is(err, ErrGovernorBacklog) {
		t.Errorf("err = %v, want ErrGovernorBacklog", err)
	}
	if errors.Is(err, context.DeadlineExceeded) {
		t.Error("our own queue was reported as the request timing out")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("the request sat in the queue for %s before being refused", elapsed)
	}
}
