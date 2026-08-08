package provider

import (
	"errors"
	"fmt"
	"testing"
	"time"
)

// Four separate paths hold a source out of a render and only one of them means
// the source refused. A hold-out that cannot name its own path reads as an
// upstream incident whichever path fired.
func TestHoldOutGateNamesEveryPath(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want string
	}{
		{"transport refusal", &RateLimitError{Source: "simkl", Status: 429}, GateUpstreamRefusal},
		{"wrapped transport refusal", fmt.Errorf("simkl: %w", &RateLimitError{Source: "simkl", Status: 429}), GateUpstreamRefusal},
		{"pacer backlog", fmt.Errorf("simkl: %w", ErrPacerBacklog), GatePacerBacklog},
		{"governor backlog", fmt.Errorf("mdblist: %w", ErrGovernorBacklog), GateGovernorBacklog},
		{"cooldown", fmt.Errorf("simkl: %w", ErrCoolingOff), GateCooldown},
		{"failure breaker", fmt.Errorf("simkl: %w", ErrFailureBreaker), GateFailureBreaker},
		{"bulk allowance", fmt.Errorf("simkl: %w", ErrBulkAllowanceHeld), GateBulkAllowance},
		{"a rate limit no gate claims", fmt.Errorf("simkl: %w", ErrRateLimited), GateUnattributed},
		{"not a rate limit", errors.New("no match for title"), ""},
		{"no error", nil, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := HoldOutGate(tc.err); got != tc.want {
				t.Errorf("HoldOutGate(%v) = %q, want %q", tc.err, got, tc.want)
			}
		})
	}
}

// Distinct names, not merely non-empty ones: the reason to attribute a hold-out
// is that the paths want opposite responses.
func TestEachGateReportsADistinctName(t *testing.T) {
	seen := map[string]string{}
	for _, tc := range []struct {
		path string
		err  error
	}{
		{"transport refusal", &RateLimitError{Source: "simkl", Status: 429}},
		{"pacer backlog", ErrPacerBacklog},
		{"governor backlog", ErrGovernorBacklog},
		{"cooldown", ErrCoolingOff},
		{"failure breaker", ErrFailureBreaker},
		{"bulk allowance", ErrBulkAllowanceHeld},
	} {
		got := HoldOutGate(tc.err)
		if got == "" || got == GateUnattributed {
			t.Errorf("%s reports %q", tc.path, got)
		}
		if other, ok := seen[got]; ok {
			t.Errorf("%s and %s both report %q", tc.path, other, got)
		}
		seen[got] = tc.path
	}
}

// A cooldown means one of two opposite things. Five timeouts in a row hold a
// source out through the same gate a 429 does, and the response to each is
// different: one is throttling, the other is a source erroring.
func TestACooldownNamesWhatSetIt(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("mdblist", &RateLimitError{Source: "mdblist", Status: 429, RetryAfter: time.Minute}, CallerInteractive)
	if got := h.CooldownReason("mdblist", CallerInteractive); got != CooldownRateLimit {
		t.Errorf("a 429 set a cooldown reported as %q, want %q", got, CooldownRateLimit)
	}

	h2 := NewHealthTracker(10, time.Hour)
	for range failureBreakerThreshold {
		h2.Failure("mal", errStub("http 504"), CallerInteractive)
	}
	if !h2.CoolingOff("mal", CallerInteractive) {
		t.Fatal("five consecutive failures did not hold the source out")
	}
	if got := h2.CooldownReason("mal", CallerInteractive); got != CooldownFailureBreaker {
		t.Errorf("the failure breaker set a cooldown reported as %q, want %q", got, CooldownFailureBreaker)
	}

	if got := h2.CooldownReason("omdb", CallerInteractive); got != "" {
		t.Errorf("a source that is not cooling off reports %q", got)
	}
}

// A success clears the reason with the timer, or the next cooldown inherits it.
func TestRecoveryClearsTheCooldownReason(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("mal", &RateLimitError{Source: "mal", Status: 429, RetryAfter: time.Minute}, CallerInteractive)
	h.Success("mal", "k", &MediaMeta{Ratings: []Rating{{Source: "mal", Value: 8}}})
	if got := h.CooldownReason("mal", CallerInteractive); got != "" {
		t.Errorf("a recovered source still reports cooldown reason %q", got)
	}
}
