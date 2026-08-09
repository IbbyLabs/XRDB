package provider

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"testing"
	"time"
)

// The inverted default. An error nobody has classified says nothing about the
// source, so it counts for nothing — which is what stops the next unclassified
// shape from holding a healthy source off every render.
func TestAnUnclassifiedErrorDoesNotCountAgainstTheSource(t *testing.T) {
	for _, err := range []error{
		errors.New("boom"),
		fmt.Errorf("fanart: no artwork found for id %q", "tt1"),
		fmt.Errorf("anilist: unsupported id %q", "x"),
		fmt.Errorf("mdblist: no api key configured"),
		context.Canceled,
		fmt.Errorf("render abandoned: %w", context.Canceled),
	} {
		h := NewHealthTracker(10, time.Hour)
		for range failureBreakerThreshold + 2 {
			if h.Failure("src", err, CallerInteractive) {
				t.Fatalf("%v reported a cooldown transition", err)
			}
		}
		if h.CoolingOff("src", CallerInteractive) {
			t.Errorf("%v held the source out", err)
		}
	}
}

// The half that matters most, because a fix that stopped counting everything
// would pass the negative check. A source that is genuinely unwell must still
// be held out.
func TestAClassifiedFaultStillHoldsTheSourceOut(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
	}{
		{"a 500", HTTPFault("src", 500)},
		{"a 502", HTTPFault("src", 502)},
		{"a 504", HTTPFault("src", 504)},
		{"a rate-limit refusal", &RateLimitError{Source: "src", Status: 429}},
		{"a real timeout", timedOut()},
		{"a rejected key", fmt.Errorf("omdb: API error: Invalid API key!: %w", ErrSourceFault)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := NewHealthTracker(10, time.Hour)
			for range failureBreakerThreshold {
				h.Failure("src", tc.err, CallerInteractive)
			}
			if !h.CoolingOff("src", CallerInteractive) {
				t.Errorf("%v no longer holds an unwell source out", tc.err)
			}
		})
	}
}

// The decision not to count leaves no other trace, so the line is the only way
// to tell the fix running from the fix absent. A test for a log line is unusual;
// this one earns it because the observable it creates is the only one there is.
func TestDecliningToCountSaysSo(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	defer slog.SetDefault(prev)

	h := NewHealthTracker(10, time.Hour)
	h.Failure("cinemeta", fmt.Errorf("cinemeta: no meta for tt1: %w", errNotFound), CallerInteractive)
	if !strings.Contains(buf.String(), "Not counting an error against the source's health") {
		t.Errorf("a declined error left no trace: %s", buf.String())
	}
	if !strings.Contains(buf.String(), "cinemeta") {
		t.Error("the line does not name the source")
	}

	// A counted failure must not produce it, or the line says nothing.
	buf.Reset()
	h.Failure("cinemeta", HTTPFault("cinemeta", 500), CallerInteractive)
	if strings.Contains(buf.String(), "Not counting an error") {
		t.Errorf("a real fault was reported as declined: %s", buf.String())
	}
}
