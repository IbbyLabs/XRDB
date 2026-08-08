package compose

import (
	"context"
	"errors"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func degradedFor(t *testing.T, p *Pipeline, req Request) bool {
	t.Helper()
	_, _, degraded, _, _ := p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
	return degraded
}

func ratingReq(sources ...string) Request {
	cfg := imageconfig.Default()
	cfg.Ratings = sources
	return Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}
}

// The catalogue case: a source in cooldown with nothing remembered leaves its
// badge off the render, and that render must not be held for the full TTL.
func TestCooldownWithNothingRememberedMarksTheRenderDegraded(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	src.refusing.Store(true)
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	req := ratingReq("simkl")
	if !degradedFor(t, p, req) {
		t.Error("a source that refused with nothing remembered did not mark the render degraded")
	}
}

// A remembered value keeps the badge on the poster, so the render is whole and
// earns the normal TTL even while the source is refusing.
func TestCooldownServingARememberedRatingIsNotDegraded(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	req := ratingReq("simkl")
	ratingsFor(t, p, req) // answers and is remembered
	src.refusing.Store(true)
	ratingsFor(t, p, req) // refuses, starting the cooldown

	if degradedFor(t, p, req) {
		t.Error("a render serving a remembered rating was marked degraded")
	}
}

// Most titles have no score on most sources. Treating an empty answer as a
// failure would put nearly every render on the short TTL.
func TestASourceWithNoRatingForTheTitleIsNotDegraded(t *testing.T) {
	src := &provider.StubProvider{ProviderName: "simkl", Meta: &provider.MediaMeta{}}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	if degradedFor(t, p, ratingReq("simkl")) {
		t.Error("a source with nothing to say about this title was treated as a failure")
	}
}

// AlloCiné and Filmweb report a title they do not carry as an error. That is a
// permanent fact about the title, not a source to wait for, and putting those
// renders on the short TTL would re-render most of the catalogue every 20
// minutes for nothing.
func TestASourceThatDoesNotCarryTheTitleIsNotDegraded(t *testing.T) {
	src := &provider.StubProvider{
		ProviderName: "filmweb",
		Err:          errors.New("filmweb: no match for \"Some Title\""),
	}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	if degradedFor(t, p, ratingReq("filmweb")) {
		t.Error("a title the source does not carry was treated as a degraded render")
	}
}

func TestAHealthySourceIsNotDegraded(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	if degradedFor(t, p, ratingReq("simkl")) {
		t.Error("a source that answered normally was marked degraded")
	}
}

func degradedSourcesFor(t *testing.T, p *Pipeline, req Request) []string {
	t.Helper()
	_, _, _, _, sources := p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
	return sources
}

// The attribution the header carries: a rate-limited source is named, so a check
// against the render can tell it was down rather than absent for the title.
func TestARateLimitedSourceIsNamedInDegradedSources(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	src.refusing.Store(true)
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	got := degradedSourcesFor(t, p, ratingReq("simkl"))
	if len(got) != 1 || got[0] != "simkl" {
		t.Errorf("expected [simkl] named degraded, got %v", got)
	}
}

func TestAnAbsentSourceIsNotNamedDegraded(t *testing.T) {
	src := &provider.StubProvider{ProviderName: "simkl", Meta: &provider.MediaMeta{}}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	if got := degradedSourcesFor(t, p, ratingReq("simkl")); len(got) != 0 {
		t.Errorf("a source with no rating for the title was named degraded: %v", got)
	}
}

func TestANoMatchErrorIsNotNamedDegraded(t *testing.T) {
	src := &provider.StubProvider{
		ProviderName: "filmweb",
		Err:          errors.New("filmweb: no match for \"Some Title\""),
	}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	if got := degradedSourcesFor(t, p, ratingReq("filmweb")); len(got) != 0 {
		t.Errorf("a no-match error was named degraded: %v", got)
	}
}
