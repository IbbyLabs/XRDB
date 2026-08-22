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

const cooldownTransitionMsg = "A ratings source is rate-limited and is held out until it recovers"

// The class alone cannot separate a person from a sweep that did not name
// itself, because an unrecognised agent classifies as interactive.
func TestCooldownTransitionNamesTheCallerAgent(t *testing.T) {
	for _, tc := range []struct {
		name       string
		agent      string
		class      provider.CallerClass
		identified bool
	}{
		{"a named sweep", "AIOMetadata/2.14.0", provider.CallerBulk, true},
		{"a stremio client", "okhttp/4.12.0", provider.CallerInteractive, true},
		{"no agent at all", "", provider.CallerInteractive, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

			reg := provider.NewRegistry()
			reg.Register(&provider.StubProvider{
				ProviderName: "tmdb",
				Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://tmdb/poster.jpg"},
			})
			reg.Register(&alwaysFailing{name: "imdb"})

			health := provider.NewHealthTracker(10, time.Hour)
			for range 4 {
				health.Failure("imdb", provider.HTTPFault("imdb", 504), tc.class)
			}

			p := &Pipeline{providers: reg, logger: logger,
				fetcher: &stubImageFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}
			p.SetHealthTracker(health)
			cfg := imageconfig.Default()
			cfg.ArtworkSource = imageconfig.ArtworkTMDB
			cfg.Ratings = []string{"imdb"}

			ctx := provider.WithCallerClass(context.Background(), tc.class)
			ctx = provider.WithCallerAgent(ctx, tc.agent)
			if _, err := p.Render(ctx, Request{
				MediaType: "poster", ContentType: "movie", MediaID: "tt9", Config: cfg,
			}); err != nil {
				t.Fatalf("Render: %v", err)
			}

			line := hasMsg(logLinesFrom(t, &buf), cooldownTransitionMsg)
			if line == nil {
				t.Fatal("entering cooldown left no transition line")
			}
			if line["user_agent"] != tc.agent {
				t.Errorf("user_agent = %v, want %q", line["user_agent"], tc.agent)
			}
			if line["caller_identified"] != tc.identified {
				t.Errorf("caller_identified = %v, want %v", line["caller_identified"], tc.identified)
			}
			if line["caller_class"] != tc.class.String() {
				t.Errorf("caller_class = %v, want %v", line["caller_class"], tc.class.String())
			}
		})
	}
}
