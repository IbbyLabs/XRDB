package provider

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

// A render whose caller went away cancels its in-flight provider requests. That
// is our side giving up, not the source failing, and recording it held the
// source out for every other render: one viewer closing a tab took every
// MDBList-fed rating off everyone's posters until the cooldown expired.
func TestACancelledRequestDoesNotHoldASourceOut(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	key := GoodKey("mdblist", "movie", "tt0118615")
	h.Success("mdblist", key, sampleMeta("mdblist", 6.5))

	err := fmt.Errorf("mdblist: request: %w", context.Canceled)
	if h.Failure("mdblist", err) {
		t.Error("a cancelled request put the source into cooldown")
	}
	for _, sh := range h.Snapshot() {
		if sh.Source == "mdblist" && !sh.Healthy {
			t.Error("a cancelled request marked the source unhealthy, so every other render loses it")
		}
	}
}

// A source that genuinely fails must still be held out, or the guard above
// would have bought quiet by disabling the tracker.
func TestARealFailureStillHoldsASourceOut(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("mdblist", errors.New("mdblist: http 500"))
	for _, sh := range h.Snapshot() {
		if sh.Source == "mdblist" && sh.Healthy {
			t.Error("a real failure left the source marked healthy")
		}
	}
}
