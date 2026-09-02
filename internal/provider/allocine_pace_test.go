package provider

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"testing"
	"time"
)

// AlloCiné's pacing lived only in one instance's environment, so every other
// deployment sent unpaced sweeps into a limiter that refuses on burst.
func TestAlloCinePacesWithoutAnOverride(t *testing.T) {
	prev := minIntervalOverrides
	minIntervalOverrides = map[string]time.Duration{}
	t.Cleanup(func() { minIntervalOverrides = prev })

	if got := PacedInterval("allocine"); got != 2*time.Second {
		t.Errorf("allocine MinInterval = %v, want the table's 2s", got)
	}
}

// The table is a floor for a deployment that sets nothing, not a ceiling on one
// that knows its own limit.
func TestAnOverrideStillWinsForAlloCine(t *testing.T) {
	prev := minIntervalOverrides
	minIntervalOverrides = map[string]time.Duration{"allocine": 500 * time.Millisecond}
	t.Cleanup(func() { minIntervalOverrides = prev })

	if got := PacedInterval("allocine"); got != 500*time.Millisecond {
		t.Errorf("allocine MinInterval = %v, want the override's 500ms", got)
	}
}

// A sweep's share is a quarter of the ceiling, so any source paced above that
// takes the floor. AlloCiné at 2s is the widest interval in the table and the
// case the cap was added for.
func TestASweepStillNeverWaitsLongerThanAPersonOnAlloCine(t *testing.T) {
	for _, maxWait := range []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second} {
		bulk := bulkMaxWait(CallerBulk, maxWait, 2*time.Second)
		if bulk > maxWait {
			t.Errorf("at a %v ceiling a sweep may wait %v against a person's %v", maxWait, bulk, maxWait)
		}
	}
}

// An override wins silently, so a later change to a built-in interval does not
// reach an instance carrying one. The startup line has to separate the three
// cases or the shadowing is invisible until someone wonders why a pace changed
// everywhere but here.
func TestAShadowingOverrideIsReportedAtStartup(t *testing.T) {
	cases := []struct {
		name      string
		overrides map[string]time.Duration
		wantLevel slog.Level
		wantField string
	}{
		{"differs from the table", map[string]time.Duration{"allocine": 5 * time.Second}, slog.LevelWarn, "built_in_ms"},
		{"matches the table", map[string]time.Duration{"allocine": 2 * time.Second}, slog.LevelInfo, "in_default_table"},
		{"no table entry", map[string]time.Duration{"tmdb": time.Second}, slog.LevelInfo, "in_default_table"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			prev := minIntervalOverrides
			minIntervalOverrides = tc.overrides
			t.Cleanup(func() { minIntervalOverrides = prev })

			buf := &bytes.Buffer{}
			LogMinIntervalOverrides(slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})))

			var rec map[string]any
			if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &rec); err != nil {
				t.Fatalf("no log line: %v (%q)", err, buf.String())
			}
			if got := rec["level"]; got != tc.wantLevel.String() {
				t.Errorf("level %v, want %v", got, tc.wantLevel)
			}
			if _, ok := rec[tc.wantField]; !ok {
				t.Errorf("line carries no %q: %v", tc.wantField, rec)
			}
		})
	}
}
