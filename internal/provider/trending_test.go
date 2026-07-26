package provider

import (
	"context"
	"testing"
)

// The badge was drawn from the config flag alone, so it appeared on every
// poster. Nothing is trending until the list says so.
func TestTrendingIndexReportsNothingWithoutAClient(t *testing.T) {
	idx := NewTrendingIndex(nil, TrendingOptions{})
	if idx.IsTrending(context.Background(), "155", "tt0468569") {
		t.Error("reported trending with no TMDB client")
	}
}

func TestTrendingIndexMatchesEveryIDForm(t *testing.T) {
	idx := NewTrendingIndex(nil, TrendingOptions{})
	idx.ids = map[string]bool{"1399": true, "tt0944947": true}

	for _, id := range []string{"1399", "tmdb:1399", "tmdb:series:1399", "series:1399", "tmdb:series:1399:1:1"} {
		if got := normalizeTrendingKey(id); got != "1399" {
			t.Errorf("normalizeTrendingKey(%q) = %q, want 1399", id, got)
		}
	}
	if got := normalizeTrendingKey("tt0944947"); got != "tt0944947" {
		t.Errorf("an IMDb id should pass through, got %q", got)
	}
	if got := normalizeTrendingKey("not-an-id"); got != "" {
		t.Errorf("an unparseable id should yield empty, got %q", got)
	}
}

func TestTrendingOptionsClampToSaneValues(t *testing.T) {
	idx := NewTrendingIndex(nil, TrendingOptions{Window: "DAY", Depth: -5})
	if idx.window != "day" {
		t.Errorf("window = %q, want day", idx.window)
	}
	if idx.depth != defaultTrendingDepth {
		t.Errorf("depth = %d, want the default %d", idx.depth, defaultTrendingDepth)
	}
	// An unrecognised window falls back to the weekly list.
	if w := NewTrendingIndex(nil, TrendingOptions{Window: "fortnight"}).window; w != "week" {
		t.Errorf("window = %q, want week", w)
	}
	if d := NewTrendingIndex(nil, TrendingOptions{Depth: 99999}).depth; d != trendingPageSize*maxTrendingPages {
		t.Errorf("depth = %d, want it clamped", d)
	}
}
