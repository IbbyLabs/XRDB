package provider

import (
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
		if _, err := p.reserve(); err != nil {
			t.Fatalf("caller %d refused inside the budget: %v", i, err)
		}
	}
	// The fourth would wait 3s, past the budget.
	_, err := p.reserve()
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
	_, _ = p.reserve() // slot at now
	_, _ = p.reserve() // slot at +1s, still inside the budget

	before := p.next
	if _, err := p.reserve(); !errors.Is(err, ErrPacerBacklog) {
		t.Fatalf("expected a refusal, got %v", err)
	}
	if !p.next.Equal(before) {
		t.Errorf("next slot moved from %v to %v on a refused caller", before, p.next)
	}
}
