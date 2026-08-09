package provider

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"
	"time"
)

// The reported defect. One person opening a series whose episodes Cinemeta has
// no data for took the IMDb badge off everyone's posters: five per-title misses
// in a row tripped the failure breaker and held a healthy source out of every
// render.
func TestATitleTheSourceDoesNotHaveIsNotASourceFailure(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	misses := []error{
		fmt.Errorf("cinemeta: no meta for %s: %w", "tt1", errNotFound),
		fmt.Errorf("simkl: no match for imdb id %q: %w", "tt2", errNotFound),
		fmt.Errorf("tmdb: no match for external id %q: %w", "tt3", errNotFound),
		HTTPFault("cinemeta", 404),
		fmt.Errorf("mal: no anime mapping: %w", ErrNotApplicable),
	}
	for i, err := range misses {
		if h.Failure("cinemeta", err, CallerInteractive) {
			t.Fatalf("miss %d entered a cooldown", i+1)
		}
	}
	if h.CoolingOff("cinemeta", CallerInteractive) {
		t.Error("five per-title misses held the source out of every render")
	}
}

// The other half, without which a fix that simply switches the breaker off
// would pass: a source that is genuinely unwell must still be held out.
func TestARealFaultStillTripsTheBreaker(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
	}{
		{"a 500", HTTPFault("simkl", 500)},
		{"a 503", HTTPFault("simkl", 503)},
		{"a rate-limit refusal", &RateLimitError{Source: "simkl", Status: 429}},
		{"a transport failure", fmt.Errorf("dial: %w", &net.OpError{Op: "dial", Err: errors.New("refused")})},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := NewHealthTracker(10, time.Hour)
			for range 5 {
				h.Failure("simkl", tc.err, CallerInteractive)
			}
			if !h.CoolingOff("simkl", CallerInteractive) {
				t.Error("a genuinely failing source was not held out")
			}
		})
	}
}

// Our own refusals never reached the source, and a caller who walked away says
// nothing about it either.
func TestOurOwnRefusalsAndCancellationsDoNotCount(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	for _, err := range []error{
		ErrPacerBacklog, ErrGovernorBacklog, ErrCoolingOff,
		ErrFailureBreaker, ErrBulkAllowanceHeld,
		context.Canceled,
		fmt.Errorf("render abandoned: %w", context.Canceled),
		ErrUpstreamUnavailable,
	} {
		for range 5 {
			if h.Failure("mal", err, CallerInteractive) {
				t.Fatalf("%v entered a cooldown", err)
			}
		}
	}
	if h.CoolingOff("mal", CallerInteractive) {
		t.Error("our own gates held a source out")
	}
}

func TestHTTPFaultClassifiesByStatus(t *testing.T) {
	for _, tc := range []struct {
		status             int
		notFound, srcFault bool
	}{
		{404, true, false},
		{410, true, false},
		{500, false, true},
		{502, false, true},
		{503, false, true},
		{400, false, false}, // our bad request: neither the title nor the source
		{401, false, false},
		{403, false, false},
	} {
		err := HTTPFault("simkl", tc.status)
		if got := errors.Is(err, errNotFound); got != tc.notFound {
			t.Errorf("http %d: errNotFound=%v, want %v", tc.status, got, tc.notFound)
		}
		if got := errors.Is(err, ErrSourceFault); got != tc.srcFault {
			t.Errorf("http %d: ErrSourceFault=%v, want %v", tc.status, got, tc.srcFault)
		}
		if got := RecordsAgainstHealth(err); got != tc.srcFault {
			t.Errorf("http %d: counts against health=%v, want %v", tc.status, got, tc.srcFault)
		}
	}
}
