package provider

import (
	"testing"
	"time"
)

// Production on 2026-09-04: MDBList at ten consecutive 502s with its hold
// expired, so CoolingOff read false while every call to it was failing. A panel
// sampling the hold on a timer calls that source working for part of every
// outage and flips back on the next failure.
func TestASourceFailingEveryCallIsFailingBetweenItsHolds(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)

	// The control: nothing has failed, so neither reading is set. Without it an
	// implementation that always answered true would satisfy the rest.
	if h.Failing("mdblist", CallerInteractive) {
		t.Fatal("setup: a source with no history read as failing")
	}

	for range failureBreakerThreshold * 2 {
		h.Failure("mdblist", HTTPFault("mdblist", 502), CallerInteractive)
	}
	if !h.CoolingOff("mdblist", CallerInteractive) {
		t.Fatal("setup: repeated failures did not hold the source out")
	}

	// Expire the hold without touching the streak, which is what the cooldown
	// elapsing does on a source nobody has called since.
	h.mu.Lock()
	h.sources["mdblist"].cooldownUntil = [3]time.Time{}
	h.mu.Unlock()

	if h.CoolingOff("mdblist", CallerInteractive) {
		t.Fatal("setup: the hold did not expire")
	}
	if !h.Failing("mdblist", CallerInteractive) {
		t.Error("a source at ten consecutive failures read as working between holds")
	}

	snapshot := h.Snapshot()
	var found bool
	for _, s := range snapshot {
		if s.Source != "mdblist" {
			continue
		}
		found = true
		if s.CoolingOff {
			t.Error("the snapshot reported a hold that had expired")
		}
		if !s.Failing {
			t.Error("the snapshot reported a constantly failing source as not failing")
		}
	}
	if !found {
		t.Fatal("the snapshot did not carry the source at all")
	}
}

// One failure is not an outage. The breaker's own threshold is the line, so a
// source that failed once and is being retried still reads as working.
func TestOneFailureDoesNotReadAsFailing(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("mdblist", HTTPFault("mdblist", 502), CallerInteractive)
	if h.Failing("mdblist", CallerInteractive) {
		t.Error("a single failure read as an outage")
	}
}

// A source that recovers stops reading as failing, or the panel never clears.
func TestARecoveredSourceStopsFailing(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	for range failureBreakerThreshold * 2 {
		h.Failure("mdblist", HTTPFault("mdblist", 502), CallerInteractive)
	}
	if !h.Failing("mdblist", CallerInteractive) {
		t.Fatal("setup: a held-out source did not read as failing")
	}
	h.Success("mdblist", "key", &MediaMeta{Ratings: []Rating{{Source: "imdb", Value: 8}}})
	if h.Failing("mdblist", CallerInteractive) {
		t.Error("a source that answered again still read as failing")
	}
}
