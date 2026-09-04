package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

type ratingStub struct {
	name    string
	sources []string
}

func (r *ratingStub) Name() string            { return r.name }
func (r *ratingStub) RatingSources() []string { return r.sources }
func (r *ratingStub) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return &provider.MediaMeta{}, nil
}

// The 2026-09-04 shape: MDBList held out takes Letterboxd with it, because
// nothing else serves that badge, while IMDb survives on another supplier. A
// panel reporting per provider would have said Letterboxd was fine.
func TestARatingIsOutOnlyWhenEverySupplierIs(t *testing.T) {
	reg := provider.NewRegistry()
	reg.Register(&ratingStub{name: "mdblist", sources: []string{"imdb", "rt", "letterboxd"}})
	reg.Register(&ratingStub{name: "omdb", sources: []string{"imdb"}})
	// Sorts before the held-out supplier. Without it the registry's alphabetical
	// order puts a reachable supplier last for every shared badge, and an
	// implementation that simply overwrote instead of accumulating would pass.
	reg.Register(&ratingStub{name: "cinemeta", sources: []string{"imdb", "rt"}})

	p := &Pipeline{providers: reg}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	// Control: with nothing held out every badge is available, so a later
	// absence is the hold rather than the wiring.
	for rating, ok := range p.RatingAvailability() {
		if !ok {
			t.Fatalf("setup: %s unavailable before anything was held out", rating)
		}
	}

	p.health.Failure("mdblist", &provider.RateLimitError{
		Source: "mdblist", RetryAfter: time.Minute, Status: 429,
	}, provider.CallerInteractive)
	if !p.health.CoolingOff("mdblist", provider.CallerInteractive) {
		t.Fatal("setup: mdblist was never held out")
	}

	avail := p.RatingAvailability()
	if avail["imdb"] != true {
		t.Error("imdb went unavailable while another supplier was reachable")
	}
	if avail["letterboxd"] != false {
		t.Error("letterboxd stayed available with its only supplier held out")
	}
	if avail["rt"] != true {
		t.Error("rt went unavailable while a supplier sorting before mdblist was reachable")
	}

	got := p.UnavailableRatings()
	if len(got) != 1 || got[0] != "letterboxd" {
		t.Errorf("UnavailableRatings() = %v, want [letterboxd]", got)
	}
}

// A bulk sweep waiting its turn is not a badge a person cannot get.
func TestABulkHoldDoesNotTakeARatingOut(t *testing.T) {
	reg := provider.NewRegistry()
	reg.Register(&ratingStub{name: "mdblist", sources: []string{"letterboxd"}})

	p := &Pipeline{providers: reg}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))
	p.health.Failure("mdblist", &provider.RateLimitError{
		Source: "mdblist", RetryAfter: time.Minute, Status: 429,
	}, provider.CallerBulk)

	if !p.health.CoolingOff("mdblist", provider.CallerBulk) {
		t.Fatal("setup: the bulk hold was never taken")
	}
	if got := p.UnavailableRatings(); len(got) != 0 {
		t.Errorf("UnavailableRatings() = %v, want none: the hold is on the sweep", got)
	}
}
