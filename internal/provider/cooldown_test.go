package provider

import (
	"errors"
	"fmt"
	"testing"
	"time"
)

// A source that refuses on rate-limit grounds will refuse the next render too,
// so it has to be held out rather than re-asked at the cost of another wait.
func TestRateLimitPutsASourceInCooldown(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	if h.CoolingOff("simkl", CallerInteractive) {
		t.Fatal("a source starts available")
	}
	h.Failure("simkl", &RateLimitError{Source: "simkl", RetryAfter: 5 * time.Second, Status: 429}, CallerInteractive)
	if !h.CoolingOff("simkl", CallerInteractive) {
		t.Error("a rate-limited source was not held out")
	}
	if h.CoolingOff("mdblist", CallerInteractive) {
		t.Error("the cooldown leaked to another source")
	}
}

// The error travels wrapped through the provider and net/http, so the check has
// to see through the wrapping.
func TestCooldownSeesAWrappedRateLimitError(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	wrapped := fmt.Errorf("simkl lookup: http get: %w",
		&RateLimitError{Source: "simkl", RetryAfter: 3 * time.Second, Status: 429})
	h.Failure("simkl", wrapped, CallerInteractive)
	if !h.CoolingOff("simkl", CallerInteractive) {
		t.Error("a wrapped rate-limit error did not trigger the cooldown")
	}
}

// An ordinary failure is not a reason to stop asking.
func TestOrdinaryFailureDoesNotCoolOff(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("omdb", errors.New("omdb: http 401"), CallerInteractive)
	if h.CoolingOff("omdb", CallerInteractive) {
		t.Error("a non-rate-limit failure held the source out")
	}
}

// A refusal with no Retry-After still has to hold the source out, or the very
// next render pays the same refusal again.
func TestRefusalWithoutRetryAfterStillCoolsOff(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("simkl", &RateLimitError{Source: "simkl", Status: 429}, CallerInteractive)
	if !h.CoolingOff("simkl", CallerInteractive) {
		t.Error("a refusal carrying no Retry-After did not hold the source out")
	}
}

// A source asking for an hour must not vanish for an hour.
func TestCooldownIsCapped(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("simkl", &RateLimitError{Source: "simkl", RetryAfter: time.Hour, Status: 429}, CallerInteractive)
	h.mu.Lock()
	until := h.sources["simkl"].cooldownUntil[CallerInteractive]
	h.mu.Unlock()
	if d := time.Until(until); d > maxCooldown+time.Second {
		t.Errorf("cooldown of %s exceeds the %s cap", d, maxCooldown)
	}
}

// The cooldown ends on its own.
func TestCooldownExpires(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("simkl", &RateLimitError{Source: "simkl", RetryAfter: time.Millisecond, Status: 429}, CallerInteractive)
	deadline := time.Now().Add(2 * time.Second)
	for h.CoolingOff("simkl", CallerInteractive) && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if h.CoolingOff("simkl", CallerInteractive) {
		t.Error("the cooldown did not expire")
	}
}

// An operator needs to see that a source is being held out, not just that it
// failed.
func TestSnapshotReportsTheCooldown(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("simkl", &RateLimitError{Source: "simkl", RetryAfter: 5 * time.Second, Status: 429}, CallerInteractive)
	for _, s := range h.Snapshot() {
		if s.Source != "simkl" {
			continue
		}
		if !s.CoolingOff {
			t.Error("the snapshot does not report the source as cooling off")
		}
		if s.Cooldowns != 1 {
			t.Errorf("Cooldowns = %d, want 1", s.Cooldowns)
		}
		return
	}
	t.Error("simkl missing from the snapshot")
}

// A live render cannot afford to sleep for the several seconds these sources
// ask for.
func TestRetryBudgetFitsInARender(t *testing.T) {
	for _, name := range []string{"simkl", "mdblist", "trakt", "kitsu", "mal", "anilist", "unlisted"} {
		if w := rateLimitFor(name).MaxRetryWait; w > time.Second {
			t.Errorf("%s waits up to %s inside a render", name, w)
		}
	}
}
