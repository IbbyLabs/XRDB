package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func TestCustomRatingLabelPrefixesItsScore(t *testing.T) {
	r := provider.Rating{Source: provider.CustomRatingSource, Label: "8.1"}
	labelled := func(label, icon string) imageconfig.Config {
		var cfg imageconfig.Config
		cfg.CustomRatingLabel = label
		if icon != "" {
			cfg.RatingProviderIconURL = map[string]string{"custom": icon}
		}
		return cfg
	}
	for _, tc := range []struct {
		name string
		cfg  imageconfig.Config
		want string
	}{
		{"no label", labelled("", ""), "8.1"},
		{"label", labelled("Mine", ""), "Mine 8.1"},
		{"icon wins", labelled("Mine", "https://example.com/m.png"), "8.1"},
	} {
		if got := ratingBadgeLabel(r, tc.cfg); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
	other := provider.Rating{Source: "imdb", Label: "8.1"}
	if got := ratingBadgeLabel(other, labelled("Mine", "")); got != "8.1" {
		t.Errorf("the label reached another source: %q", got)
	}
}

func TestRatingsCacheIDIsScopedOnlyForScopingProviders(t *testing.T) {
	ctx := provider.WithKeys(context.Background(), map[string]string{provider.KeyCustomRating: "https://a.example/r?id={imdb}"})
	custom := provider.NewCustomRating()
	if id := ratingsCacheID(ctx, custom, "tt0111161"); id == "tt0111161" {
		t.Error("the custom source shares the unscoped cache entry")
	}
	other := provider.WithKeys(context.Background(), map[string]string{provider.KeyCustomRating: "https://b.example/r?id={imdb}"})
	if ratingsCacheID(ctx, custom, "tt0111161") == ratingsCacheID(other, custom, "tt0111161") {
		t.Error("two templates share one cache entry")
	}
	if id := ratingsCacheID(ctx, provider.NewOMDB("k"), "tt0111161"); id != "tt0111161" {
		t.Errorf("an ordinary source got a scoped id %q", id)
	}
}
