package provider

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
	"time"
)

func budgetLines(buf *bytes.Buffer) []map[string]any {
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

// The reserve latches: once the day crosses limit-reserve, every bulk caller is
// held out until midnight. Reporting only the crossing means the busiest part of
// the day produces no line at all, so a hold-out says which gate fired and never
// how much is left.
func TestTheDailyBudgetReportsHeadroomBetweenTransitions(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 8, 11, 12, 0, 0, 0, time.UTC)}
	b := &dailyBudget{
		source:      "simkl",
		limit:       15000,
		reserve:     6000,
		reportEvery: 300 * time.Second,
		now:         clock.now,
	}
	var buf bytes.Buffer
	b.logger = slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	// Well inside the allowance, so nothing transitions.
	b.spend()
	b.allowsBulk()
	buf.Reset()

	for range 12 {
		clock.advance(30 * time.Second)
		b.allowsBulk()
	}

	lines := budgetLines(&buf)
	if len(lines) == 0 {
		t.Fatal("six minutes of steady calls produced no allowance line, so headroom cannot be read from the log")
	}
	last := lines[len(lines)-1]
	for _, field := range []string{"spent", "limit", "reserve", "bulk_cut_off", "remaining", "remaining_pct"} {
		if _, ok := last[field]; !ok {
			t.Errorf("the allowance line carries no %q", field)
		}
	}
}

// Reporting on every call would put a line on a hot path.
func TestTheDailyBudgetReportsNoFasterThanTheInterval(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 8, 11, 12, 0, 0, 0, time.UTC)}
	b := &dailyBudget{
		source: "simkl", limit: 15000, reserve: 6000,
		reportEvery: 300 * time.Second, now: clock.now,
	}
	var buf bytes.Buffer
	b.logger = slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	b.allowsBulk()
	buf.Reset()

	for range 100 {
		clock.advance(time.Second)
		b.allowsBulk()
	}
	if n := len(budgetLines(&buf)); n > 1 {
		t.Errorf("a hundred calls inside one interval wrote %d lines", n)
	}
}

// bulk_cut_off is the number that explains a hold-out: it is not the limit, and
// reading the limit as the threshold makes a latched reserve look like the day
// running out.
func TestTheReportedCutOffIsTheReserveBoundary(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 8, 11, 12, 0, 0, 0, time.UTC)}
	b := &dailyBudget{
		source: "simkl", limit: 15000, reserve: 6000,
		reportEvery: time.Second, now: clock.now,
	}
	var buf bytes.Buffer
	b.logger = slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	clock.advance(2 * time.Second)
	b.allowsBulk()

	lines := budgetLines(&buf)
	if len(lines) == 0 {
		t.Fatal("control: no line was written at all, so the field cannot be checked")
	}
	got := lines[len(lines)-1]["bulk_cut_off"]
	if got != float64(9000) {
		t.Errorf("bulk_cut_off = %v, want 9000 (limit 15000 less reserve 6000)", got)
	}
}

// Interactive callers never reach allowsBulk and spend the same allowance, so a
// day of ordinary traffic must still report what it has used.
func TestSpendingAloneReportsTheHeadroom(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 8, 11, 12, 0, 0, 0, time.UTC)}
	b := &dailyBudget{
		source: "simkl", limit: 15000, reserve: 6000,
		reportEvery: 60 * time.Second, now: clock.now,
	}
	var buf bytes.Buffer
	b.logger = slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	// Only spend() — nothing here consults the bulk gate.
	for range 5 {
		clock.advance(30 * time.Second)
		b.spend()
	}

	lines := budgetLines(&buf)
	if len(lines) == 0 {
		t.Fatal("spending alone reported no headroom, so an interactive-only day says nothing")
	}
	if got := lines[len(lines)-1]["spent"]; got == nil {
		t.Error("the line carries no spent count")
	}
}
