package imageconfig

import (
	"encoding/json"
	"testing"
)

func TestProviderWeightsRoundTrip(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"ratingProviderWeights":{"IMDb":62.5,"tmdb":0}}`))
	if got := cfg.RatingProviderWeights["imdb"]; got != 62.5 {
		t.Errorf("imdb share = %v, want 62.5", got)
	}
	// Zero is a real setting ("this source does not count"), not an absent one.
	// It has to survive parsing, or a source could never be switched off.
	got, ok := cfg.RatingProviderWeights["tmdb"]
	if !ok || got != 0 {
		t.Errorf("tmdb share = %v (present=%v), want 0 present", got, ok)
	}
	if len(cfg.Legacy) != 0 {
		t.Errorf("ratingProviderWeights leaked to Legacy: %v", cfg.Legacy)
	}
}

func TestProviderWeightsRejectUnusableValues(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"ratingProviderWeights":{"imdb":-3,"tmdb":1e9,"rt":33.5}}`))
	if _, ok := cfg.RatingProviderWeights["imdb"]; ok {
		t.Error("negative share accepted")
	}
	if got := cfg.RatingProviderWeights["tmdb"]; got != maxProviderWeight {
		t.Errorf("oversized share = %v, want clamp to a full %v", got, float64(maxProviderWeight))
	}
	if got := cfg.RatingProviderWeights["rt"]; got != 33.5 {
		t.Errorf("rt share = %v, want 33.5", got)
	}
}

func TestRingPriorityRoundTrip(t *testing.T) {
	cfg := Parse(json.RawMessage(`{
		"ringCriticsPriority": ["Metacritic", " rt ", "metacritic", ""],
		"ringAudiencePriority": ["trakt", "imdb"]
	}`))
	want := []string{"metacritic", "rt"}
	if len(cfg.RingCriticsPriority) != len(want) {
		t.Fatalf("critics priority = %v, want %v", cfg.RingCriticsPriority, want)
	}
	for i, s := range want {
		if cfg.RingCriticsPriority[i] != s {
			t.Errorf("critics priority[%d] = %q, want %q", i, cfg.RingCriticsPriority[i], s)
		}
	}
	if len(cfg.RingAudiencePriority) != 2 || cfg.RingAudiencePriority[0] != "trakt" {
		t.Errorf("audience priority = %v, want [trakt imdb]", cfg.RingAudiencePriority)
	}
	if len(cfg.Legacy) != 0 {
		t.Errorf("ring priority leaked to Legacy: %v", cfg.Legacy)
	}
}

func TestWeightsAndPriorityChangeTheCacheKey(t *testing.T) {
	// Both change what the rendered image says, so a cached render from before
	// the change must not be served after it.
	plain := Parse(json.RawMessage(`{"ratings":["imdb","tmdb"]}`))
	weighted := Parse(json.RawMessage(`{"ratings":["imdb","tmdb"],"ratingProviderWeights":{"imdb":70}}`))
	ordered := Parse(json.RawMessage(`{"ratings":["imdb","tmdb"],"ringAudiencePriority":["tmdb","imdb"]}`))

	if CacheKey(plain) == CacheKey(weighted) {
		t.Error("provider weights left the cache key unchanged")
	}
	if CacheKey(plain) == CacheKey(ordered) {
		t.Error("ring priority left the cache key unchanged")
	}
	if CacheKey(weighted) == CacheKey(ordered) {
		t.Error("weights and priority collided in the cache key")
	}
}
