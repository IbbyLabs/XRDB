package provider

import (
	"context"
	"errors"
	"testing"
	"time"
)

// The client timeout covers the queue wait as well as the call, so a request
// that queues past it is cancelled before it is ever sent. Refusing early keeps
// the render fast and leaves the slot for a caller that can use it.
func TestPacerRefusesRatherThanQueuePastTheBudget(t *testing.T) {
	p := &pacer{interval: time.Second, maxWait: 2 * time.Second}

	// Three callers fit inside the budget: slots at +0s, +1s, +2s.
	for i := 0; i < 3; i++ {
		if _, err := p.reserve(-1); err != nil {
			t.Fatalf("caller %d refused inside the budget: %v", i, err)
		}
	}
	// The fourth would wait 3s, past the budget.
	_, err := p.reserve(-1)
	if !errors.Is(err, ErrPacerBacklog) {
		t.Fatalf("fourth caller err = %v, want ErrPacerBacklog", err)
	}
	if !errors.Is(err, ErrRateLimited) {
		t.Error("a backlog refusal should read as a rate-limit refusal")
	}
}

// A refused caller must not take the slot it was refused, or the backlog grows
// from requests that were never sent.
func TestARefusedCallerDoesNotTakeASlot(t *testing.T) {
	p := &pacer{interval: time.Second, maxWait: time.Second}
	_, _ = p.reserve(-1) // slot at now
	_, _ = p.reserve(-1) // slot at +1s, still inside the budget

	before := p.next
	if _, err := p.reserve(-1); !errors.Is(err, ErrPacerBacklog) {
		t.Fatalf("expected a refusal, got %v", err)
	}
	if !p.next.Equal(before) {
		t.Errorf("next slot moved from %v to %v on a refused caller", before, p.next)
	}
}

// The pacer shares the client's timeout with the call it is queuing for. A turn
// that arrives with too little left cancels the request mid-flight, and that
// cancellation is recorded against the source rather than against us
// (BUG-245).
func TestThePacerRefusesATurnItCannotUse(t *testing.T) {
	p := &pacer{interval: time.Second, maxWait: 30 * time.Second}
	// Push the next slot four seconds out.
	for i := 0; i < 4; i++ {
		if _, err := p.reserve(-1); err != nil {
			t.Fatalf("priming reserve %d: %v", i, err)
		}
	}

	// Plenty of budget: the turn is worth taking.
	if _, err := p.reserve(30 * time.Second); err != nil {
		t.Errorf("refused a turn with 30s of budget: %v", err)
	}

	// Not enough left for the call: refuse rather than consume it.
	if _, err := p.reserve(time.Second); !errors.Is(err, ErrPacerBacklog) {
		t.Errorf("took a turn arriving after the budget ran out, err %v", err)
	}
}

// A caller with no deadline is bounded by maxWait alone, as before.
func TestThePacerStillWorksWithoutADeadline(t *testing.T) {
	p := &pacer{interval: time.Millisecond, maxWait: time.Second}
	if err := p.wait(context.Background()); err != nil {
		t.Errorf("a deadline-less caller was refused: %v", err)
	}
}
