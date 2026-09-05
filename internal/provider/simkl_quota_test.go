package provider

import (
	"context"
	"testing"
)

// SIMKL rotates through noteQuota, and every other SIMKL test builds a one-key
// ring, which cannot move. So the branch that moves it has never been run: the
// suite passes with the markSpent call deleted.
//
// The refusal is classified by the transport, which isQuotaRefusal covers on its
// own, so these start from the typed error rather than from a response body.

func TestASpentSIMKLAllowanceRotatesTheKey(t *testing.T) {
	s := &SIMKL{keys: newKeyRing("first,second")}
	if got := s.keys.current(); got != "first" {
		t.Fatalf("the ring started on %q, want first", got)
	}

	s.noteQuota(context.Background(), "first",
		&RateLimitError{Source: "simkl", QuotaExhausted: true})

	if got := s.keys.current(); got != "second" {
		t.Errorf("current = %q, want second after the allowance was spent", got)
	}
}

// The control. A refusal that is not a spent allowance must leave the ring
// alone, or every rate limit costs a credential.
func TestASIMKLRateLimitThatIsNotAQuotaLeavesTheRing(t *testing.T) {
	s := &SIMKL{keys: newKeyRing("first,second")}

	s.noteQuota(context.Background(), "first", &RateLimitError{Source: "simkl"})

	if got := s.keys.current(); got != "first" {
		t.Errorf("current = %q, want first", got)
	}
}

// An owner's credential has its own allowance, so spending it says nothing about
// the server's.
func TestAnOwnerKeySpentOnSIMKLDoesNotMoveTheServerRing(t *testing.T) {
	s := &SIMKL{keys: newKeyRing("first,second")}
	ctx := WithKeys(context.Background(), map[string]string{KeySIMKL: "theirs"})

	s.noteQuota(ctx, "theirs", &RateLimitError{Source: "simkl", QuotaExhausted: true})

	if got := s.keys.current(); got != "first" {
		t.Errorf("current = %q, want first", got)
	}
}
