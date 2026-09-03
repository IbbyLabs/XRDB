package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// A remembered answer is the ordinary case, not a degraded one. Health recording
// is guarded on the source having been asked; serving is not. Putting that guard
// on the branch rather than inside it sent every cache hit past the return and
// into the degraded fallback, which served the same ratings and reported the
// source as degraded with a nil error.
func TestACacheHitIsNotReportedAsDegraded(t *testing.T) {
	p := &Pipeline{}
	p.SetHealthTracker(provider.NewHealthTracker(100, time.Hour))
	p.SetRatingsCacheTTL(time.Hour)

	prov := &provider.StubProvider{
		ProviderName: "wikidata",
		Meta:         oneRating("wikidata"),
	}
	ctx := provider.WithCallerClass(context.Background(), provider.CallerInteractive)
	req := Request{MediaID: "tt1"}

	if _, degraded, err := p.fetchRatingsResilient(ctx, prov, req, nil); err != nil || degraded {
		t.Fatalf("setup: the first fetch reported degraded=%v err=%v", degraded, err)
	}

	meta, degraded, err := p.fetchRatingsResilient(ctx, prov, req, nil)
	if err != nil {
		t.Fatalf("the cache hit errored: %v", err)
	}
	if degraded {
		t.Error("a cache hit was reported as degraded")
	}
	if meta == nil || len(meta.Ratings) != 1 {
		t.Errorf("the cache hit served %+v, want the remembered rating", meta)
	}
	if prov.Calls != 1 {
		t.Errorf("the source was asked %d times, want 1", prov.Calls)
	}
}
