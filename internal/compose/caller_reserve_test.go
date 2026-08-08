package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// holdBulkOff drives the reserve gate directly, so a test proves the behaviour
// without spending a real allowance.
func holdBulkOff(t *testing.T, held bool) {
	t.Helper()
	prev := provider.BulkCallerMayReach
	provider.BulkCallerMayReach = func(string) bool { return !held }
	t.Cleanup(func() { provider.BulkCallerMayReach = prev })
}

// ratingsForCaller runs a render as a given class of caller.
func ratingsForCaller(t *testing.T, p *Pipeline, req Request, class provider.CallerClass) []provider.Rating {
	t.Helper()
	ctx := provider.WithCallerClass(context.Background(), class)
	all, _, _, _, _ := p.collectRatingsWithProviders(ctx, req, &provider.MediaMeta{})
	return all
}

func reserveTestPipeline(src provider.Provider) (*Pipeline, Request) {
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"simkl"}
	return p, Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}
}

// The reserve exists so a catalogue sweep cannot spend what a person's render
// needs. Holding bulk traffic off the source is the whole mechanism.
func TestBulkCallerIsHeldOffTheReserve(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p, req := reserveTestPipeline(src)

	// The gate open: a bulk caller reaches the source like anyone else.
	holdBulkOff(t, false)
	ratingsForCaller(t, p, req, provider.CallerBulk)
	if got := src.calls.Load(); got != 1 {
		t.Fatalf("the source was called %d times with the allowance intact; want 1", got)
	}

	// The gate shut: it is not asked at all.
	holdBulkOff(t, true)
	before := src.calls.Load()
	for i := 0; i < 5; i++ {
		ratingsForCaller(t, p, req, provider.CallerBulk)
	}
	if got := src.calls.Load(); got != before {
		t.Errorf("the source was called %d more times inside the reserve", got-before)
	}
}

// Holding a source back is a skip, not a failure. Recording it as a failure
// would cool the source off for every caller, which is the outcome the reserve
// exists to prevent.
func TestHoldingBulkOffDoesNotCoolTheSourceOffForEveryone(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p, req := reserveTestPipeline(src)

	holdBulkOff(t, true)
	for i := 0; i < 5; i++ {
		ratingsForCaller(t, p, req, provider.CallerBulk)
	}
	if p.Health().CoolingOff("simkl", provider.CallerInteractive) {
		t.Fatal("holding bulk callers back put the source into cooldown for every caller")
	}

	before := src.calls.Load()
	ratingsForCaller(t, p, req, provider.CallerInteractive)
	if got := src.calls.Load(); got != before+1 {
		t.Errorf("an interactive render did not reach the source: calls went from %d to %d", before, got)
	}
}

// The reserve is spent by interactive callers by design, so the gate must never
// apply to them.
func TestInteractiveCallerSpendsTheReserve(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p, req := reserveTestPipeline(src)

	holdBulkOff(t, true)
	for i := 0; i < 3; i++ {
		ratingsForCaller(t, p, req, provider.CallerInteractive)
	}
	if got := src.calls.Load(); got != 3 {
		t.Errorf("the source was called %d times by interactive renders; want 3", got)
	}
}

// A held-back render still carries the badge when the title has been fetched
// before. Losing it is what makes the failure invisible.
func TestHeldBackRenderStillServesTheRememberedRating(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p, req := reserveTestPipeline(src)

	holdBulkOff(t, false)
	ratingsForCaller(t, p, req, provider.CallerBulk) // remembered

	holdBulkOff(t, true)
	got := ratingsForCaller(t, p, req, provider.CallerBulk)
	if len(got) == 0 {
		t.Fatal("a held-back render lost the rating it had already been given")
	}
	if got[0].Source != "simkl" {
		t.Errorf("the remembered rating came back as %q", got[0].Source)
	}
}
