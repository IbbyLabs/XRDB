package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// These call fetchRatingsResilient itself.
//
// The tests beside them reproduce the guard inside the test and assert against
// that copy, which passes whatever the production code does — deleting
// `&& !ownerKeyed` from the real guard leaves them green. A guard that has
// already caused a production incident once wants a test that fails when it is
// removed, not one that describes it.

func rateLimitedPipeline(t *testing.T, source string) (*Pipeline, provider.Provider) {
	t.Helper()
	p := &Pipeline{}
	p.SetHealthTracker(provider.NewHealthTracker(100, time.Hour))
	prov := &provider.StubProvider{
		ProviderName: source,
		Err:          &provider.RateLimitError{Source: source, Status: 429, RetryAfter: time.Hour},
	}
	return p, prov
}

// An owner key's 429 says nothing about the shared source's health. Recording it
// would hold the source out for every other render on the instance.
func TestOwnerKeyedFailureLeavesTheSharedCooldownAlone(t *testing.T) {
	const source = "mdblist"
	p, prov := rateLimitedPipeline(t, source)

	ctx := provider.WithKeys(context.Background(),
		map[string]string{provider.KeyMDBList: "owner-key"})
	_, _, _ = p.fetchRatingsResilient(ctx, prov, Request{MediaID: "tt1"}, nil)

	if p.health.CoolingOff(source, provider.CallerInteractive) {
		t.Fatal("an owner key's 429 set the shared cooldown")
	}
}

// The control for the test above: without an owner key the same failure through
// the same call must set the cooldown, or the test above would pass on a build
// where nothing records anything at all.
func TestSharedKeyedFailureDoesSetTheCooldown(t *testing.T) {
	const source = "mdblist"
	p, prov := rateLimitedPipeline(t, source)

	_, _, _ = p.fetchRatingsResilient(context.Background(), prov, Request{MediaID: "tt1"}, nil)

	if !p.health.CoolingOff(source, provider.CallerInteractive) {
		t.Fatal("a shared-key 429 did not set the cooldown, so the guard above proves nothing")
	}
}

// The read side of the same separation: with the shared key cooling off, a
// render carrying the owner's own credential must still reach the source. This
// is the point of a per-profile key — it is exactly the render that should work
// while the shared one is exhausted.
func TestOwnerKeyedRenderStillReachesACoolingSource(t *testing.T) {
	const source = "mdblist"
	p := &Pipeline{}
	p.SetHealthTracker(provider.NewHealthTracker(100, time.Hour))
	p.health.Failure(source,
		&provider.RateLimitError{Source: source, Status: 429, RetryAfter: time.Hour},
		provider.CallerInteractive)
	if !p.health.CoolingOff(source, provider.CallerInteractive) {
		t.Fatal("the source is not cooling off, so this measures nothing")
	}

	prov := &provider.StubProvider{
		ProviderName: source,
		Meta:         &provider.MediaMeta{Title: "x"},
	}
	ctx := provider.WithKeys(context.Background(),
		map[string]string{provider.KeyMDBList: "owner-key"})
	_, _, _ = p.fetchRatingsResilient(ctx, prov, Request{MediaID: "tt1"}, nil)

	if prov.Calls == 0 {
		t.Fatal("an owner-keyed render was gated by the shared key's cooldown")
	}
}

// Its control: without an owner key the same render must be gated, or the test
// above passes on a build where the cooldown gates nothing.
func TestSharedKeyedRenderIsGatedByTheCooldown(t *testing.T) {
	const source = "mdblist"
	p := &Pipeline{}
	p.SetHealthTracker(provider.NewHealthTracker(100, time.Hour))
	p.health.Failure(source,
		&provider.RateLimitError{Source: source, Status: 429, RetryAfter: time.Hour},
		provider.CallerInteractive)

	prov := &provider.StubProvider{
		ProviderName: source,
		Meta:         &provider.MediaMeta{Title: "x"},
	}
	_, _, _ = p.fetchRatingsResilient(context.Background(), prov, Request{MediaID: "tt1"}, nil)

	if prov.Calls != 0 {
		t.Fatal("a shared-key render reached a cooling source, so the test above proves nothing")
	}
}
