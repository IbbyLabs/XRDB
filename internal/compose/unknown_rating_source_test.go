package compose

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func ratingSourcePipeline(t *testing.T) (*Pipeline, *bytes.Buffer) {
	t.Helper()
	reg := provider.NewRegistry()
	reg.Register(provider.NewTMDB("k", ""))
	reg.Register(provider.NewMDBList("k"))
	reg.Register(provider.NewOMDB("k"))
	reg.Register(provider.NewAlloCine())
	reg.Register(provider.NewFilmweb())
	reg.Register(provider.NewSIMKL("k"))
	reg.Register(provider.NewTrakt("k"))
	buf := &bytes.Buffer{}
	p := &Pipeline{
		providers: reg,
		logger:    slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelWarn})),
	}
	return p, buf
}

func warnedSources(buf *bytes.Buffer) []string {
	var out []string
	for _, line := range strings.Split(buf.String(), "\n") {
		if line == "" {
			continue
		}
		var rec map[string]any
		if json.Unmarshal([]byte(line), &rec) != nil {
			continue
		}
		if s, ok := rec["source"].(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// A config naming a source the parser does not know renders a poster that is
// byte-identical to one that never asked for it, so the log is the only place
// the name can be seen.
func TestAnUnrecognisedRatingSourceIsReported(t *testing.T) {
	p, buf := ratingSourcePipeline(t)
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"rt", "tomatoes", "imdb"}

	p.warnUnknownRatingSources(context.Background(), cfg)

	got := warnedSources(buf)
	if len(got) != 1 || got[0] != "tomatoes" {
		t.Fatalf("reported %v, want only the legacy spelling", got)
	}
}

// A false warning on a working config is worse than none: it sends someone to
// change a setting that was right.
func TestEveryBuiltInPriorityNameIsRecognised(t *testing.T) {
	p, _ := ratingSourcePipeline(t)
	known := p.knownRatingSources()
	for _, name := range append(append([]string{}, defaultCriticsPriority...), defaultAudiencePriority...) {
		if !known[name] {
			t.Errorf("%q is a built-in priority name but no provider answers for it", name)
		}
	}
}

// Once per name, not once per render.
func TestAnUnrecognisedSourceIsReportedOnce(t *testing.T) {
	p, buf := ratingSourcePipeline(t)
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"tomatoes"}

	for range 5 {
		p.warnUnknownRatingSources(context.Background(), cfg)
	}

	if got := warnedSources(buf); len(got) != 1 {
		t.Errorf("reported %d times, want once: %v", len(got), got)
	}
}

// The per-type lists are part of the config even when this render is a film, so
// a misspelling in the series list is reported rather than waiting for a series.
func TestAMisspellingInAPerTypeListIsReported(t *testing.T) {
	p, buf := ratingSourcePipeline(t)
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb"}
	cfg.RatingsSeries = []string{"trackt"}

	p.warnUnknownRatingSources(context.Background(), cfg)

	got := warnedSources(buf)
	if len(got) != 1 || got[0] != "trackt" {
		t.Fatalf("reported %v, want the series-list misspelling", got)
	}
}
