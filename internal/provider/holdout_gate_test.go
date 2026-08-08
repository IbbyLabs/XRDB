package provider

import (
	"errors"
	"fmt"
	"testing"
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
		{"cooldown", fmt.Errorf("simkl: %w", ErrCoolingOff), GateCooldown},
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
		{"cooldown", ErrCoolingOff},
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
