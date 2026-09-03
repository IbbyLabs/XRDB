package provider

import (
	"testing"
	"time"
)

func healthOf(t *testing.T, h *HealthTracker, source string) SourceHealth {
	t.Helper()
	for _, sh := range h.Snapshot() {
		if sh.Source == source {
			return sh
		}
	}
	t.Fatalf("no health entry for %q", source)
	return SourceHealth{}
}

// A hold is per caller class, so a sweep's cooldown must survive an interactive
// render that receives nothing. TestASuccessClearsBothHolds is the control: a
// real answer does clear it.
func TestAnEmptyAnswerDoesNotReleaseAnotherCallersHold(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("wikidata", rateLimited("wikidata"), CallerBulk)
	if !h.CoolingOff("wikidata", CallerBulk) {
		t.Fatal("setup: the bulk hold was never taken")
	}

	h.Empty("wikidata")

	if !h.CoolingOff("wikidata", CallerBulk) {
		t.Error("an answer carrying no ratings released the sweep's hold")
	}
}

// Success is reached from two call sites and must not depend on either of them
// checking first.
func TestSuccessWithNoRatingsTakesTheEmptyPath(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("wikidata", rateLimited("wikidata"), CallerBulk)

	if h.Success("wikidata", GoodKey("wikidata", "movie", "tt1"), &MediaMeta{}) {
		t.Error("an empty answer reported itself as a recovery")
	}
	if !h.CoolingOff("wikidata", CallerBulk) {
		t.Error("an empty answer through Success released the sweep's hold")
	}
	if got := healthOf(t, h, "wikidata").ConsecutiveEmpty; got != 1 {
		t.Errorf("ConsecutiveEmpty = %d, want 1", got)
	}
}

// The run is the signal, not the single answer: wikidata answers empty for most
// titles legitimately.
func TestConsecutiveEmptyCountsTheRunAndAnAnswerEndsIt(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	for i := 0; i < 3; i++ {
		h.Empty("letterboxd")
	}
	if got := healthOf(t, h, "letterboxd").ConsecutiveEmpty; got != 3 {
		t.Fatalf("ConsecutiveEmpty = %d, want 3", got)
	}

	h.Success("letterboxd", GoodKey("letterboxd", "movie", "tt1"), sampleMeta("letterboxd", 8.2))

	if got := healthOf(t, h, "letterboxd").ConsecutiveEmpty; got != 0 {
		t.Errorf("ConsecutiveEmpty = %d after a real answer, want 0", got)
	}
}

// Successes measures reachability, so it counts an empty answer. LastSuccess
// measures useful output, so it does not.
func TestAnEmptyAnswerIsReachableButNotASuccess(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Empty("rt")

	sh := healthOf(t, h, "rt")
	if sh.Successes != 1 {
		t.Errorf("Successes = %d, want 1: the source answered", sh.Successes)
	}
	if sh.LastSuccess != "" {
		t.Errorf("LastSuccess = %q, want empty: nothing was carried", sh.LastSuccess)
	}
}
