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

// An owner key's success must not clear the shared key's cooldown, or the
// shared source flaps between exhausted and "recovered" while any owner-keyed
// user browses. Remember caches the result without touching health.
func TestRememberDoesNotClearTheSharedCooldown(t *testing.T) {
	h := NewHealthTracker(100, time.Hour)
	h.Failure("mdblist", &RateLimitError{Source: "mdblist", Status: 429, RetryAfter: time.Hour})
	if !h.CoolingOff("mdblist") {
		t.Fatal("mdblist should be cooling off")
	}

	// The owner-keyed path: cache a good result.
	h.Remember(GoodKey("mdblist", "movie", "tt1"), &MediaMeta{Ratings: []Rating{{Source: "mdblist", Value: 8}}})

	if !h.CoolingOff("mdblist") {
		t.Error("Remember cleared the shared cooldown")
	}
	// And it still cached the value for the fallback path.
	if _, ok := h.LastGood("mdblist", GoodKey("mdblist", "movie", "tt1")); !ok {
		t.Error("Remember did not cache the good result")
	}
}
