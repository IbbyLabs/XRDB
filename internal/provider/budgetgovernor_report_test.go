package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"testing"
	"time"
)

// governorLines returns the decoded log records the governor wrote.
func governorLines(buf *bytes.Buffer) []map[string]any {
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var rec map[string]any
		if err := json.Unmarshal([]byte(line), &rec); err == nil {
			out = append(out, rec)
		}
	}
	return out
}

// A day's allowance can run most of the way down without the rate ever halving,
// so a log that only speaks on a transition can go a whole day without naming a
// number. Pacing comfortably and nearly exhausted then read identically.
func TestTheGovernorReportsHeadroomBetweenGearChanges(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	var buf bytes.Buffer
	g.logger = slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	reset := clock.t.Add(12 * time.Hour)
	// The first response is a gear change, and is reported already.
	g.observe(context.Background(), allowanceHeaders(100000, 80000, reset))
	buf.Reset()

	// Six hours of steady spending, never fast enough to halve the rate.
	for i := range 12 {
		clock.advance(30 * time.Minute)
		g.observe(context.Background(), allowanceHeaders(100000, 79000-i*1000, reset))
	}

	lines := governorLines(&buf)
	if len(lines) == 0 {
		t.Fatal("six hours of spending produced no allowance line, so headroom cannot be read from the log")
	}
	last := lines[len(lines)-1]
	if _, ok := last["remaining"]; !ok {
		t.Error("the allowance line carries no absolute figure")
	}
	if _, ok := last["remaining_pct"]; !ok {
		t.Error("the allowance line carries no percentage")
	}
}

// Reporting on every response would put a line on a hot path.
func TestTheGovernorReportsHeadroomNoFasterThanTheInterval(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	var buf bytes.Buffer
	g.logger = slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	reset := clock.t.Add(12 * time.Hour)
	g.observe(context.Background(), allowanceHeaders(100000, 80000, reset))
	buf.Reset()

	// A hundred responses inside one interval.
	for range 100 {
		clock.advance(time.Second)
		g.observe(context.Background(), allowanceHeaders(100000, 80000, reset))
	}
	if n := len(governorLines(&buf)); n > 1 {
		t.Errorf("a hundred responses inside one interval wrote %d lines", n)
	}
}

// A hold-out reads the same whether the day is nearly spent or our own ceiling
// is holding the rate down, and the two want opposite responses.
func TestTheGovernorNamesTheConstraintHoldingTheRate(t *testing.T) {
	g, _, _ := newTestGovernor(t)

	for _, tc := range []struct {
		name                       string
		limit, remaining, secsLeft float64
		want                       pacedBy
	}{
		// Plenty left and little of the day to spend it in: our own ceiling.
		{"ceiling", 100000, 100000, 60, pacedByCeiling},
		// A full day ahead of a full allowance: the budget sets the rate.
		{"budget", 100000, 100000, dailyWindow.Seconds(), pacedByBudget},
		// Spent into the reserve.
		{"reserve", 100000, 10000, dailyWindow.Seconds(), pacedByReserve},
		// Above the reserve but too little to matter over a long window.
		{"floor", 100000, 25100, dailyWindow.Seconds(), pacedByFloor},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, got := g.rateFor(tc.limit, tc.remaining, tc.secsLeft); got != tc.want {
				t.Errorf("rate held by %q, want %q", got, tc.want)
			}
		})
	}
}

// A hold-out at the budget gate reads the same whether the day is spent or the
// configured ceiling is holding the rate down. Correlating it with the nearest
// allowance report is a join across up to a whole report interval; the refusal
// carries the answer itself.
func TestARefusalNamesTheConstraintThatSetTheRate(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	// Spend the day into the reserve, so the rate is the floor.
	g.observe(context.Background(), allowanceHeaders(100000, 1000, clock.t.Add(12*time.Hour)))

	// Drain the bucket, then ask with too little budget left to wait.
	for range int(mdblistDefaultBurst) + 1 {
		ctx, cancel := context.WithDeadline(context.Background(), clock.t.Add(time.Hour))
		_ = g.wait(ctx)
		cancel()
	}
	ctx, cancel := context.WithDeadline(context.Background(), clock.t.Add(2*time.Second))
	defer cancel()
	err := g.wait(ctx)
	if err == nil {
		t.Fatal("a drained bucket with two seconds of budget was not refused")
	}
	if !errors.Is(err, ErrGovernorBacklog) {
		t.Fatalf("refusal is no longer the budget gate: %v", err)
	}
	if got := HoldOutReason(err); got != string(pacedByReserve) {
		t.Errorf("refusal names %q as the constraint, want %q", got, pacedByReserve)
	}
}

// A gate that is not rate-derived has no constraint to name, and must not
// invent one.
func TestANonRateRefusalNamesNoConstraint(t *testing.T) {
	if got := HoldOutReason(fmt.Errorf("mdblist: %w", ErrFailureBreaker)); got != "" {
		t.Errorf("the failure breaker named %q as a pacing constraint", got)
	}
}

// The daily budget models the quota on the server's key. A render carrying a
// user's own key spends that user's allowance and none of ours, so a spent
// shared quota is not a reason to refuse it. The box's own rate band still is.
func TestASpentQuotaDoesNotRefuseAnOwnerKeyedCall(t *testing.T) {
	drain := func(g *budgetGovernor) {
		for range int(g.burst) + 1 {
			_, _ = g.take(0, false)
		}
	}
	deadline := func(clock *fakeClock) (context.Context, context.CancelFunc) {
		return context.WithDeadline(context.Background(), clock.t.Add(2*time.Second))
	}

	// Control: the same drained quota refuses a call on the server's key.
	g, clock, _ := newTestGovernor(t)
	g.rate = 0.001
	drain(g)
	ctx, cancel := deadline(clock)
	defer cancel()
	if err := g.wait(ctx); err == nil {
		t.Fatal("control: a spent quota did not refuse a call on the shared key")
	}

	g2, clock2, _ := newTestGovernor(t)
	g2.rate = 0.001
	drain(g2)
	owner := WithKeys(context.Background(), map[string]string{KeyMDBList: "a-visitor-key"})
	ctx2, cancel2 := context.WithDeadline(owner, clock2.t.Add(2*time.Second))
	defer cancel2()
	if err := g2.wait(ctx2); err != nil {
		t.Errorf("a spent shared quota refused a call spending someone else's allowance: %v", err)
	}
}

// The ceiling protects this box rather than a quota, so it applies whichever key
// a call carries.
func TestTheCeilingStillPacesAnOwnerKeyedCall(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	g.maxRPS = 0.001
	for range int(g.burst) + 1 {
		_, _ = g.takeCeiling(0, false)
	}
	owner := WithKeys(context.Background(), map[string]string{KeyMDBList: "a-visitor-key"})
	ctx, cancel := context.WithDeadline(owner, clock.t.Add(2*time.Second))
	defer cancel()
	err := g.wait(ctx)
	if err == nil {
		t.Fatal("a drained ceiling did not pace an owner-keyed call")
	}
	if got := HoldOutReason(err); got != string(pacedByCeiling) {
		t.Errorf("refusal names %q, want %q", got, pacedByCeiling)
	}
}
