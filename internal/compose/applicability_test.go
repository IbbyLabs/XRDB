package compose

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// animeOnlySource answers only for titles it has a mapping for, which it can
// decide locally. It refuses on rate-limit grounds once switched, so a render
// can be driven with the source genuinely cooling off.
type animeOnlySource struct {
	calls    atomic.Int32
	refusing atomic.Bool
}

func (a *animeOnlySource) Name() string            { return "mal" }
func (a *animeOnlySource) RatingSources() []string { return []string{"mal"} }
func (a *animeOnlySource) AppliesTo(_ context.Context, _, id string) bool {
	return strings.HasPrefix(id, "anime")
}

func (a *animeOnlySource) Fetch(_ context.Context, _, id string) (*provider.MediaMeta, error) {
	a.calls.Add(1)
	if !a.AppliesTo(context.Background(), "", id) {
		return nil, provider.ErrNotApplicable
	}
	if a.refusing.Load() {
		return nil, &provider.RateLimitError{Source: "mal", RetryAfter: 5 * time.Second, Status: 429}
	}
	return &provider.MediaMeta{Ratings: []provider.Rating{
		{Source: "mal", Value: 8.1, Label: "8.1"},
	}}, nil
}

func coolingOffAnimeSource(t *testing.T) (*Pipeline, *animeOnlySource, imageconfig.Config) {
	t.Helper()
	src := &animeOnlySource{}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"mal"}
	anime := Request{MediaType: "poster", ContentType: "movie", MediaID: "anime1", Config: cfg}

	ratingsFor(t, p, anime)
	src.refusing.Store(true)
	ratingsFor(t, p, anime)

	if !p.health.CoolingOff("mal", provider.CallerClassFrom(context.Background())) {
		t.Fatal("the source is not cooling off, so this proves nothing")
	}
	return p, src, cfg
}

// The reported defect. A source cools off from a title it could answer for, and
// from then on every title it could never answer for carries its X, because the
// hold-out gate fires before anything asks whether the source applies.
func TestACoolingOffSourceMarksNothingOnATitleItCannotAnswerFor(t *testing.T) {
	p, _, cfg := coolingOffAnimeSource(t)

	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt404", Config: cfg}
	all, _, degraded, _, _, degradedSources := p.collectRatingsWithProviders(
		context.Background(), req, &provider.MediaMeta{})

	if degraded {
		t.Error("a title the source cannot answer for was counted as a lost source")
	}
	if len(degradedSources) != 0 {
		t.Errorf("degraded sources %v, want none", degradedSources)
	}
	if got := p.unavailableSources(degradedSources, cfg.Ratings, all); len(got) != 0 {
		t.Errorf("placeholders %v drawn for a source that could never answer", got)
	}
}

// The source is still held out for titles it does apply to, or the fix has
// bought the missing X by dropping the source altogether.
func TestACoolingOffSourceStillMarksATitleItCouldAnswerFor(t *testing.T) {
	p, _, cfg := coolingOffAnimeSource(t)

	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "anime2", Config: cfg}
	all, _, degraded, _, _, degradedSources := p.collectRatingsWithProviders(
		context.Background(), req, &provider.MediaMeta{})

	if !degraded {
		t.Fatal("a title the source applies to lost it silently")
	}
	got := p.unavailableSources(degradedSources, cfg.Ratings, all)
	if len(got) != 1 || got[0] != "mal" {
		t.Errorf("placeholders %v, want mal crossed out", got)
	}
}

// Applicability is asked before availability, so a source that cannot answer is
// never called even when it is perfectly healthy.
func TestASourceThatCannotApplyIsNotCalled(t *testing.T) {
	src := &animeOnlySource{}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"mal"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt404", Config: cfg}

	ratingsFor(t, p, req)

	if got := src.calls.Load(); got != 0 {
		t.Errorf("the source was called %d times for a title it cannot answer for", got)
	}
}

// A source that does not declare applicability is tried, so the check cannot
// silently drop the sources that have no way to answer it.
func TestASourceWithNoApplicabilityIsStillCalled(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"simkl"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "anything", Config: cfg}

	ratingsFor(t, p, req)

	if src.calls.Load() == 0 {
		t.Error("a source that declares no applicability was skipped")
	}
}
