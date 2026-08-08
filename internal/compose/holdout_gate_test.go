package compose

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image/color"
	"log/slog"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

const holdOutMsg = "A ratings source was held out and dropped from this render; its badge is missing"

func logLinesFrom(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
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

// The same source, held out twice for different reasons, must report different
// gates: once because it refused, then because the cooldown that refusal left
// skipped it without asking. A count of hold-outs cannot separate the two, and
// they want opposite responses.
func TestAHeldOutSourceNamesTheGateThatDroppedIt(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	})
	reg.Register(&alwaysFailing{name: "imdb"})

	p := &Pipeline{providers: reg, logger: logger,
		fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}
	p.SetHealthTracker(provider.NewHealthTracker(10, time.Hour))
	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	cfg.Ratings = []string{"imdb"}

	var gates []string
	for _, id := range []string{"tt1", "tt2"} {
		buf.Reset()
		if _, err := p.Render(context.Background(), Request{
			MediaType: "poster", ContentType: "movie", MediaID: id, Config: cfg,
		}); err != nil {
			t.Fatalf("render %s: %v", id, err)
		}
		line := hasMsg(logLinesFrom(t, &buf), holdOutMsg)
		if line == nil {
			t.Fatalf("render %s held a source out and left no warning", id)
		}
		gate, _ := line["gate"].(string)
		if gate == "" {
			t.Fatalf("render %s held a source out without naming the gate", id)
		}
		gates = append(gates, gate)
	}

	if gates[0] != provider.GateUpstreamRefusal {
		t.Errorf("the source's own 429 reported gate %q, want %q", gates[0], provider.GateUpstreamRefusal)
	}
	if gates[1] != provider.GateCooldown {
		t.Errorf("a hold-out from the cooldown left by an earlier refusal reported gate %q, want %q", gates[1], provider.GateCooldown)
	}
}

// The breaker that trips after five plain failures holds a source out through
// the same path a 429 does. Reporting both as a cooldown sends whoever reads it
// to check a quota for a source that is timing out.
func TestTheFailureBreakerIsNotReportedAsARateLimitCooldown(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
	})
	reg.Register(&alwaysFailing{name: "imdb"})

	health := provider.NewHealthTracker(10, time.Hour)
	for range 5 {
		health.Failure("imdb", errors.New("http 504"), provider.CallerInteractive)
	}
	if !health.CoolingOff("imdb", provider.CallerInteractive) {
		t.Fatal("five plain failures did not hold the source out")
	}

	p := &Pipeline{providers: reg, logger: logger,
		fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}
	p.SetHealthTracker(health)
	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	cfg.Ratings = []string{"imdb"}

	if _, err := p.Render(context.Background(), Request{
		MediaType: "poster", ContentType: "movie", MediaID: "tt9", Config: cfg,
	}); err != nil {
		t.Fatalf("Render: %v", err)
	}

	line := hasMsg(logLinesFrom(t, &buf), holdOutMsg)
	if line == nil {
		t.Fatal("a source held out by the failure breaker left no warning")
	}
	if line["gate"] != provider.GateFailureBreaker {
		t.Errorf("gate = %v, want %v", line["gate"], provider.GateFailureBreaker)
	}
}
