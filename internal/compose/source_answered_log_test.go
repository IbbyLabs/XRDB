package compose

import (
	"bytes"
	"context"
	"encoding/json"
	"image/color"
	"log/slog"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// A source that answers. The held-out warning has no denominator without one:
// a window with no warning reads the same whether the source was healthy or
// whether nothing asked for it.
type answering struct{ name string }

func (a *answering) Name() string            { return a.name }
func (a *answering) RatingSources() []string { return []string{a.name} }
func (a *answering) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return &provider.MediaMeta{Title: "T", Ratings: []provider.Rating{
		{Source: a.name, Value: 8.0, Label: "8.0"},
	}}, nil
}

func renderWithLogAt(t *testing.T, level slog.Level, sources []string, rate provider.Provider) []map[string]any {
	t.Helper()
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: level}))

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	})
	reg.Register(rate)

	p := &Pipeline{providers: reg, logger: logger,
		fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))
	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	cfg.Ratings = sources
	if _, err := p.Render(context.Background(), Request{
		MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg,
	}); err != nil {
		t.Fatalf("Render: %v", err)
	}

	var lines []map[string]any
	for _, raw := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if raw == "" {
			continue
		}
		var line map[string]any
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			t.Fatalf("log line is not JSON: %s", raw)
		}
		lines = append(lines, line)
	}
	return lines
}

func hasMsg(lines []map[string]any, msg string) map[string]any {
	for _, line := range lines {
		if line["msg"] == msg {
			return line
		}
	}
	return nil
}

func TestAnAnsweringSourceIsVisibleAtInfo(t *testing.T) {
	lines := renderWithLogAt(t, slog.LevelInfo, []string{"imdb"}, &answering{name: "imdb"})
	line := hasMsg(lines, "A ratings source answered")
	if line == nil {
		t.Fatal("production runs at info, so a source that answered leaves no record there and the held-out warning has nothing to be counted against")
	}
	if line["source"] != "imdb" {
		t.Errorf("source = %v, want imdb", line["source"])
	}
}

func TestASourceThatFailedIsNotRecordedAsAnswering(t *testing.T) {
	lines := renderWithLogAt(t, slog.LevelInfo, []string{"imdb"}, &alwaysFailing{name: "imdb"})
	if line := hasMsg(lines, "A ratings source answered"); line != nil {
		t.Errorf("a refused source counted as an answer: %v", line)
	}
	if hasMsg(lines, "A ratings source was held out and did not answer; its badge is left empty") == nil {
		t.Error("a refused source left no warning")
	}
}
