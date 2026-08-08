package compose

import (
	"bytes"
	"context"
	"image/color"
	"log/slog"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

const answeredMsg = "A ratings source answered"
const staleMsg = "A ratings source is held out; serving a remembered rating"

// A source in cooldown with a remembered value never reaches the fetch, so the
// render carries a rating nobody asked the source for. Counting that as an
// answer inflates the denominator the hold-out warnings are read against: the
// more sources are cooling off, the healthier the window looks.
func TestARatingServedFromMemoryIsNotCountedAsAnAnswer(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	})
	reg.Register(&alwaysFailing{name: "imdb"})

	health := provider.NewHealthTracker(10, time.Hour)
	health.Failure("imdb", &provider.RateLimitError{Source: "imdb", RetryAfter: time.Minute, Status: 429}, provider.CallerInteractive)
	health.Remember(provider.GoodKey("imdb", "movie", "tt1"), &provider.MediaMeta{
		Title: "T", Ratings: []provider.Rating{{Source: "imdb", Value: 8.0, Label: "8.0"}},
	})

	p := &Pipeline{providers: reg, logger: logger,
		fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}
	p.SetHealthTracker(health)
	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	cfg.Ratings = []string{"imdb"}

	if _, err := p.Render(context.Background(), Request{
		MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg,
	}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	lines := logLinesFrom(t, &buf)

	if line := hasMsg(lines, answeredMsg); line != nil && line["source"] == "imdb" {
		t.Errorf("a rating served from memory was logged as an answer from the source: %v", line)
	}
	line := hasMsg(lines, staleMsg)
	if line == nil {
		t.Fatal("a rating served from memory left no record, so the share of a window served from memory cannot be read from the log at all")
	}
	if line["source"] != "imdb" {
		t.Errorf("source = %v, want imdb", line["source"])
	}
	if line["media_id"] != "tt1" {
		t.Errorf("media_id = %v, want tt1", line["media_id"])
	}
	if _, ok := line["age_ms"]; !ok {
		t.Error("the remembered rating's age is missing, so a stale serve cannot be told from a fresh one")
	}
}
