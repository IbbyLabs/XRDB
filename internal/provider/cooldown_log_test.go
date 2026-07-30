package provider

import (
	"testing"
	"time"
)

// The transition into cooldown must be reported exactly once, so an operator
// gets one log line when a metered source goes down rather than one per render
// or none at all.
func TestFailureReportsTheCooldownTransitionOnce(t *testing.T) {
	h := NewHealthTracker(100, time.Hour)
	rl := &RateLimitError{Source: "mdblist", Status: 429, RetryAfter: time.Hour}

	if !h.Failure("mdblist", rl) {
		t.Error("the first rate-limit failure did not report entering cooldown")
	}
	if h.Failure("mdblist", rl) {
		t.Error("a second failure while already cooling off reported the transition again")
	}
}

// A plain error is not a cooldown, so it must not report the transition.
func TestAPlainFailureIsNotACooldownTransition(t *testing.T) {
	h := NewHealthTracker(100, time.Hour)
	if h.Failure("tmdb", errStub("http 500")) {
		t.Error("a non-rate-limit failure reported a cooldown transition")
	}
}

// Recovery is reported once, when a held-out source answers again.
func TestSuccessReportsRecoveryOnce(t *testing.T) {
	h := NewHealthTracker(100, time.Hour)
	h.Failure("mdblist", &RateLimitError{Source: "mdblist", Status: 429, RetryAfter: time.Hour})

	meta := &MediaMeta{Ratings: []Rating{{Source: "mdblist", Value: 8}}}
	if !h.Success("mdblist", "k", meta) {
		t.Error("recovery from cooldown was not reported")
	}
	if h.Success("mdblist", "k", meta) {
		t.Error("a healthy source reported recovery again")
	}
}

type errStub string

func (e errStub) Error() string { return string(e) }
