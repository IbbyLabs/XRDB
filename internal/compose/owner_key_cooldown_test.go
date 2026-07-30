package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// The decision the fix turns on: when the shared key is cooling off, a render
// carrying the owner's own key must NOT be gated out, while a render without one
// still is. This mirrors the condition in fetchRatingsResilient.
func TestOwnerKeyBypassesTheSharedCooldown(t *testing.T) {
	h := provider.NewHealthTracker(100, time.Hour)
	// Exhaust the shared MDBList allowance.
	h.Failure("mdblist", &provider.RateLimitError{Source: "mdblist", Status: 429, RetryAfter: time.Hour})
	if !h.CoolingOff("mdblist") {
		t.Fatal("mdblist should be cooling off after a 429")
	}

	shared := context.Background()
	owner := provider.WithKeys(shared, map[string]string{provider.KeyMDBList: "owner-key"})

	// gated reproduces the guard: skip only when there is no owner key AND the
	// source is cooling off.
	gated := func(ctx context.Context) bool {
		return !provider.HasOwnerKey(ctx, "mdblist") && h.CoolingOff("mdblist")
	}

	if !gated(shared) {
		t.Error("a shared-key render was not gated while the shared key is exhausted")
	}
	if gated(owner) {
		t.Error("an owner-key render was gated by the shared key's cooldown")
	}
}
