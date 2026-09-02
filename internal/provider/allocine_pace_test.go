package provider

import (
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
