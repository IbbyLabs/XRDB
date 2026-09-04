package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

type artStub struct{ name string }

func (a *artStub) Name() string { return a.name }
func (a *artStub) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return &provider.MediaMeta{}, nil
}

func artworkRegistry(names ...string) *provider.Registry {
	reg := provider.NewRegistry()
	for _, n := range names {
		reg.Register(&artStub{name: n})
	}
	return reg
}

// A profile names an artwork source directly, so the answer is per source. One
// held out says so without touching the others.
func TestAnArtworkSourceIsOutOnItsOwn(t *testing.T) {
	p := &Pipeline{providers: artworkRegistry("tmdb", "fanart", "cinemeta", "mediux")}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	for name, ok := range p.ArtworkAvailability() {
		if !ok {
			t.Fatalf("setup: %s unavailable before anything was held out", name)
		}
	}

	p.health.Failure("mediux", &provider.RateLimitError{
		Source: "mediux", RetryAfter: time.Minute, Status: 429,
	}, provider.CallerInteractive)

	avail := p.ArtworkAvailability()
	if avail["mediux"] != false {
		t.Error("mediux stayed available while held out")
	}
	if avail["tmdb"] != true || avail["fanart"] != true || avail["cinemeta"] != true {
		t.Errorf("a held-out source took the others with it: %v", avail)
	}
	if got := p.UnavailableArtworkSources(); len(got) != 1 || got[0] != "mediux" {
		t.Errorf("UnavailableArtworkSources() = %v, want [mediux]", got)
	}
}

// A source nothing answers for is absent rather than reported broken.
func TestAnUnregisteredArtworkSourceIsNotReported(t *testing.T) {
	p := &Pipeline{providers: artworkRegistry("tmdb")}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	avail := p.ArtworkAvailability()
	if _, ok := avail["mediux"]; ok {
		t.Error("mediux was reported without a provider answering for it")
	}
	if len(avail) != 1 || avail["tmdb"] != true {
		t.Errorf("ArtworkAvailability() = %v, want only a reachable tmdb", avail)
	}
}

// The fallback chain is what a render tries after the configured source. It is
// exhausted only when every general source is held out, and the configured
// source being out does not exhaust it.
func TestTheFallbackChainSurvivesUntilEveryGeneralSourceIsOut(t *testing.T) {
	p := &Pipeline{providers: artworkRegistry("tmdb", "fanart", "cinemeta", "mediux")}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	hold := func(name string) {
		p.health.Failure(name, &provider.RateLimitError{
			Source: name, RetryAfter: time.Minute, Status: 429,
		}, provider.CallerInteractive)
		if !p.health.CoolingOff(name, provider.CallerInteractive) {
			t.Fatalf("setup: %s was never held out", name)
		}
	}

	if !p.ArtworkFallbackReachable() {
		t.Fatal("setup: the chain was unreachable before anything was held out")
	}
	hold("mediux")
	if !p.ArtworkFallbackReachable() {
		t.Error("a configured source going out emptied the fallback chain")
	}
	hold("fanart")
	hold("tmdb")
	if !p.ArtworkFallbackReachable() {
		t.Error("the chain was called exhausted while cinemeta was still reachable")
	}
	hold("cinemeta")
	if p.ArtworkFallbackReachable() {
		t.Error("the chain read as reachable with every general source held out")
	}
}

// keyedStub answers only when it has been given a key, the way every provider
// that reads one behaves.
type keyedStub struct {
	name    string
	ratings []string
	keyed   bool
}

func (k *keyedStub) Name() string            { return k.name }
func (k *keyedStub) RatingSources() []string { return k.ratings }
func (k *keyedStub) HasCredentials() bool    { return k.keyed }
func (k *keyedStub) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return &provider.MediaMeta{}, nil
}

// A provider this instance has no key for is absent from both sections rather
// than named as an outage. It is never called, so its breaker tripping says
// nothing about what a render can reach.
//
// The keyed half runs first as the positive control: without it an empty result
// would pass for the wrong reason, because a section that reported nothing at
// all would satisfy the second half on its own.
func TestAProviderWithNoKeyIsNotNamedAsAnOutage(t *testing.T) {
	build := func(keyed bool) (*Pipeline, *provider.HealthTracker) {
		reg := provider.NewRegistry()
		reg.Register(&keyedStub{name: "mediux", keyed: keyed})
		reg.Register(&keyedStub{name: "mdblist", ratings: []string{"letterboxd"}, keyed: keyed})
		reg.Register(&keyedStub{name: "tmdb", ratings: []string{"tmdb"}, keyed: true})
		p := &Pipeline{providers: reg}
		health := provider.NewHealthTracker(10, time.Hour)
		p.SetHealthTracker(health)
		return p, health
	}
	hold := func(t *testing.T, health *provider.HealthTracker, name string) {
		t.Helper()
		health.Failure(name, &provider.RateLimitError{
			Source: name, RetryAfter: time.Minute, Status: 429,
		}, provider.CallerInteractive)
		if !health.CoolingOff(name, provider.CallerInteractive) {
			t.Fatalf("setup: %s was never held out", name)
		}
	}

	keyed, keyedHealth := build(true)
	hold(t, keyedHealth, "mediux")
	hold(t, keyedHealth, "mdblist")
	if got := keyed.UnavailableArtworkSources(); len(got) != 1 || got[0] != "mediux" {
		t.Fatalf("control: a keyed held-out artwork source was not named, got %v", got)
	}
	if got := keyed.UnavailableRatings(); len(got) != 1 || got[0] != "letterboxd" {
		t.Fatalf("control: a keyed held-out badge was not named, got %v", got)
	}

	keyless, keylessHealth := build(false)
	hold(t, keylessHealth, "mediux")
	hold(t, keylessHealth, "mdblist")
	if got := keyless.UnavailableArtworkSources(); len(got) != 0 {
		t.Errorf("an artwork source with no key was named as an outage: %v", got)
	}
	if got := keyless.UnavailableRatings(); len(got) != 0 {
		t.Errorf("a badge whose only supplier has no key was named as an outage: %v", got)
	}
	if _, named := keyless.ArtworkAvailability()["mediux"]; named {
		t.Error("a keyless artwork source appeared in the availability map")
	}
	if _, named := keyless.RatingAvailability()["letterboxd"]; named {
		t.Error("a badge with no keyed supplier appeared in the availability map")
	}
}
