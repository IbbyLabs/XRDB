package provider

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

// A source that does not apply to a title must not be counted a failure, or a
// genuine outage drowns in "this is not an anime" noise.
func TestNotApplicableDoesNotDamageHealth(t *testing.T) {
	h := NewHealthTracker(100, time.Hour)

	// Wrapped the way the providers wrap it, so errors.Is sees the sentinel.
	wrapped := fmt.Errorf("kitsu: no anime mapping for id %q: %w", "tt0111161", ErrNotApplicable)

	for i := 0; i < 50; i++ {
		h.Failure("kitsu", wrapped)
	}

	for _, s := range h.Snapshot() {
		if s.Source == "kitsu" {
			if !s.Healthy {
				t.Errorf("a not-applicable result marked kitsu unhealthy: %d failures", s.Failures)
			}
			if s.Failures != 0 {
				t.Errorf("not-applicable counted as %d failures, want 0", s.Failures)
			}
		}
	}
}

// A real error still counts, so an actual outage is still visible.
func TestARealFailureStillCounts(t *testing.T) {
	h := NewHealthTracker(100, time.Hour)
	h.Failure("kitsu", errors.New("kitsu: http 503"))
	for _, s := range h.Snapshot() {
		if s.Source == "kitsu" && (s.Healthy || s.Failures != 1) {
			t.Errorf("a real failure was not recorded: healthy=%v failures=%d", s.Healthy, s.Failures)
		}
	}
}

func TestHasOwnerKey(t *testing.T) {
	ctx := WithKeys(context.Background(), map[string]string{KeyMDBList: "k"})
	if !HasOwnerKey(ctx, "mdblist") {
		t.Error("an owner mdblist key was not detected")
	}
	if HasOwnerKey(ctx, "omdb") {
		t.Error("an omdb key was reported when only mdblist was set")
	}
	if HasOwnerKey(context.Background(), "mdblist") {
		t.Error("a bare context reported an owner key")
	}
}
