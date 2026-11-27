package provider

import (
	"errors"
	"fmt"
	"net"
	"testing"
	"time"
)

func TestABurstOfConcurrentFailuresDoesNotTripTheBreaker(t *testing.T) {
	h, clk := newClockedHealth()
	for i := range 10 {
		clk.advance(100 * time.Millisecond)
		if h.Failure("mdblist", timedOut(), CallerInteractive) {
			t.Fatalf("failure %d entered a cooldown inside one stall", i+1)
		}
	}
	if h.CoolingOff("mdblist", CallerInteractive) || h.Failing("mdblist", CallerInteractive) {
		t.Error("ten failures inside one second held the source out")
	}
}

func TestAFailureStreakPastTheSpanTrips(t *testing.T) {
	h, clk := newClockedHealth()
	for range failureBreakerThreshold {
		h.Failure("mdblist", timedOut(), CallerInteractive)
	}
	if h.CoolingOff("mdblist", CallerInteractive) {
		t.Fatal("setup: the breaker tripped before the span passed")
	}
	clk.advance(failureBreakerSpan)
	if !h.Failure("mdblist", timedOut(), CallerInteractive) {
		t.Error("a streak that outlasted the span did not enter a cooldown")
	}
	if !h.CoolingOff("mdblist", CallerInteractive) || h.CooldownReason("mdblist", CallerInteractive) != CooldownFailureBreaker {
		t.Error("the breaker did not hold the source out")
	}
}

func TestAFastFailingOutageTripsOnceTheSpanPassesAndBacksOff(t *testing.T) {
	h, clk := newClockedHealth()
	refused := fmt.Errorf("dial: %w", &net.OpError{Op: "dial", Err: errors.New("connection refused")})

	// Many requests, all instant refusals, spread across the span.
	for range 40 {
		h.Failure("mdblist", refused, CallerInteractive)
		clk.advance(failureBreakerSpan / 20)
	}
	if !h.CoolingOff("mdblist", CallerInteractive) {
		t.Fatal("an outage of instant refusals never tripped the breaker")
	}
	h.mu.Lock()
	first := h.sources["mdblist"].cooldownUntil[CallerInteractive].Sub(clk.now())
	h.sources["mdblist"].cooldownUntil = [callerClassCount]time.Time{}
	h.mu.Unlock()

	h.Failure("mdblist", refused, CallerInteractive)
	h.mu.Lock()
	second := h.sources["mdblist"].cooldownUntil[CallerInteractive].Sub(clk.now())
	h.mu.Unlock()
	if second <= first {
		t.Errorf("second hold = %s, want longer than the first (%s)", second, first)
	}
}

func TestASuccessInsideTheSpanResetsTheStreak(t *testing.T) {
	h, clk := newClockedHealth()
	for range failureBreakerThreshold - 1 {
		h.Failure("mdblist", timedOut(), CallerInteractive)
	}
	clk.advance(failureBreakerSpan / 2)
	h.Success("mdblist", GoodKey("mdblist", "movie", "tt1"), &MediaMeta{Ratings: []Rating{{Source: "mdblist", Value: 8}}})

	// A fresh streak starts from the next failure, so it needs its own span.
	clk.advance(failureBreakerSpan)
	for range failureBreakerThreshold + 3 {
		if h.Failure("mdblist", timedOut(), CallerInteractive) {
			t.Fatal("failures after a success were counted against the old streak")
		}
	}
	clk.advance(failureBreakerSpan)
	if !h.Failure("mdblist", timedOut(), CallerInteractive) {
		t.Error("the new streak never tripped once it outlasted the span")
	}
}

func TestARateLimitStillTripsImmediately(t *testing.T) {
	h, _ := newClockedHealth()
	if !h.Failure("mdblist", &RateLimitError{Source: "mdblist", Status: 429, RetryAfter: time.Minute}, CallerInteractive) {
		t.Error("a rate-limit refusal waited on the failure span")
	}
}
