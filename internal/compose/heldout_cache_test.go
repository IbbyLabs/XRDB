package compose

import (
	"bytes"
	"context"
	"image/color"
	"log/slog"
	"sync"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

const cachedMsg = "A ratings source is held out; serving a cached rating"
const rememberedMsg = "A ratings source is held out; serving a remembered rating"

// answersThenRefuses answers every title until it is switched, then rate-limits,
// which is the shape of a source that works and then goes down.
type answersThenRefuses struct {
	mu      sync.Mutex
	name    string
	refuse  bool
	ratings []provider.Rating
}

func (a *answersThenRefuses) Name() string            { return a.name }
func (a *answersThenRefuses) RatingSources() []string { return []string{a.name} }
func (a *answersThenRefuses) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.refuse {
		return nil, &provider.RateLimitError{Source: a.name, RetryAfter: time.Minute, Status: 429}
	}
	return &provider.MediaMeta{Ratings: a.ratings}, nil
}

func (a *answersThenRefuses) stop() {
	a.mu.Lock()
	a.refuse = true
	a.mu.Unlock()
}

// heldOutPipeline builds a pipeline whose LastGood store holds one entry, which
// is the production shape in miniature: 5,000 entries against the ratings
// cache's 106,735, so the small one evicts while the large one keeps the answer.
func heldOutPipeline(t *testing.T, buf *bytes.Buffer, source *answersThenRefuses) (*Pipeline, *provider.HealthTracker, imageconfig.Config) {
	t.Helper()
	logger := slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	})
	reg.Register(source)

	p := &Pipeline{providers: reg, logger: logger,
		fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}
	health := provider.NewHealthTracker(1, time.Hour)
	p.SetHealthTracker(health)
	p.ratings = newRatingsCache(time.Hour, logger)

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	cfg.Ratings = []string{source.name}
	return p, health, cfg
}

func renderTitle(t *testing.T, p *Pipeline, cfg imageconfig.Config, id string) {
	t.Helper()
	if _, err := p.Render(context.Background(), Request{
		MediaType: "poster", ContentType: "movie", MediaID: id, Config: cfg,
	}); err != nil {
		t.Fatalf("render %s: %v", id, err)
	}
}

// A source that is held out reaches its return without ever reading the ratings
// cache, so an answer it already holds goes unserved. Production on 2026-09-04:
// 26.6 percent of held-out renders were for titles already answered.
//
// The LastGood store is bounded at one entry here so the second render evicts
// the first, leaving the ratings cache as the only memory holding it. Without
// that eviction the remembered branch answers and this test passes whether or
// not the cache is ever consulted.
func TestAHeldOutSourceServesFromTheRatingsCache(t *testing.T) {
	var buf bytes.Buffer
	src := &answersThenRefuses{name: "imdb", ratings: []provider.Rating{{Source: "imdb", Value: 8.1}}}
	p, health, cfg := heldOutPipeline(t, &buf, src)

	// Both memories learn tt1, then tt2 pushes tt1 out of the smaller one.
	renderTitle(t, p, cfg, "tt1")
	renderTitle(t, p, cfg, "tt2")
	if _, ok := health.LastGood("imdb", provider.GoodKey("imdb", "movie", "tt1")); ok {
		t.Fatal("setup: tt1 is still in LastGood, so the remembered branch would answer")
	}
	if _, _, ok := p.ratings.peek(provider.GoodKey("imdb", "movie", "tt1")); !ok {
		t.Fatal("setup: tt1 is not in the ratings cache, so there is nothing to serve")
	}

	src.stop()
	for range 6 {
		health.Failure("imdb", &provider.RateLimitError{
			Source: "imdb", RetryAfter: time.Minute, Status: 429,
		}, provider.CallerInteractive)
	}
	if !health.CoolingOff("imdb", provider.CallerInteractive) {
		t.Fatal("setup: imdb was never held out")
	}

	buf.Reset()
	renderTitle(t, p, cfg, "tt1")

	lines := logLinesFrom(t, &buf)
	if hasMsg(lines, rememberedMsg) != nil {
		t.Fatal("the remembered branch answered, so this proves nothing about the cache")
	}
	line := hasMsg(lines, cachedMsg)
	if line == nil {
		t.Fatal("a held-out source did not serve the answer sitting in the ratings cache")
	}
	if got := line["outcome"]; got != outcomeCached {
		t.Errorf("outcome = %v, want %q", got, outcomeCached)
	}
	if got := line["source"]; got != "imdb" {
		t.Errorf("source = %v, want imdb", got)
	}
}

// A title the cache has never held still reports the hold-out, or the fix would
// be hiding outages rather than answering through them.
func TestATitleTheCacheNeverHeldIsStillHeldOut(t *testing.T) {
	var buf bytes.Buffer
	src := &answersThenRefuses{name: "imdb", ratings: []provider.Rating{{Source: "imdb", Value: 8.1}}}
	p, health, cfg := heldOutPipeline(t, &buf, src)

	renderTitle(t, p, cfg, "tt1")
	src.stop()
	for range 6 {
		health.Failure("imdb", &provider.RateLimitError{
			Source: "imdb", RetryAfter: time.Minute, Status: 429,
		}, provider.CallerInteractive)
	}

	buf.Reset()
	renderTitle(t, p, cfg, "tt-never-seen")

	lines := logLinesFrom(t, &buf)
	if line := hasMsg(lines, cachedMsg); line != nil {
		t.Errorf("a title never fetched was served from the cache: %v", line["media_id"])
	}
	if hasMsg(lines, holdOutMsg) == nil {
		t.Error("a title never fetched left no hold-out record")
	}
}

// A remembered empty is not served while the source that would confirm it is
// down. Serving one would state as fact that a title has no score, learned from
// a source we cannot currently reach.
func TestARememberedEmptyIsNotServedThroughAnOutage(t *testing.T) {
	var buf bytes.Buffer
	src := &answersThenRefuses{name: "imdb"} // answers, carrying no ratings
	p, health, cfg := heldOutPipeline(t, &buf, src)

	// answering is what lets an empty be stored at all, and what trusted
	// re-checks before serving one. Wired the way the pipeline wires it, then
	// flipped to stand for the source having stopped answering.
	answering := true
	p.ratings.answering = func(string, string, time.Duration) bool { return answering }

	renderTitle(t, p, cfg, "tt1")
	renderTitle(t, p, cfg, "tt2")

	key := provider.GoodKey("imdb", "movie", "tt1")
	if _, _, ok := p.ratings.peek(key); !ok {
		t.Fatal("setup: the empty answer was not stored, so declining it later proves nothing")
	}

	src.stop()
	answering = false
	for range 6 {
		health.Failure("imdb", &provider.RateLimitError{
			Source: "imdb", RetryAfter: time.Minute, Status: 429,
		}, provider.CallerInteractive)
	}

	buf.Reset()
	renderTitle(t, p, cfg, "tt1")
	if line := hasMsg(logLinesFrom(t, &buf), cachedMsg); line != nil {
		t.Error("an empty answer was served as a cached rating during an outage")
	}
}
