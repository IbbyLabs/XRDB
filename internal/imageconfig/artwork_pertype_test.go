package imageconfig

import (
	"encoding/json"
	"testing"
)

func TestArtworkSourceForFollowsTheKind(t *testing.T) {
	cfg := Default()
	cfg.ArtworkSource = ArtworkTMDB
	cfg.ArtworkSourceAnime = ArtworkFanart
	cfg.ArtworkSourceMovie = ArtworkOMDB

	cases := []struct {
		name        string
		contentType string
		isAnime     bool
		want        ArtworkSource
	}{
		{"anime beats series", "series", true, ArtworkFanart},
		{"movie override", "movie", false, ArtworkOMDB},
		{"series falls through", "series", false, ArtworkTMDB},
		{"unknown kind falls through", "", false, ArtworkTMDB},
		{"anime override wins over movie", "movie", true, ArtworkFanart},
	}
	for _, c := range cases {
		if got := ArtworkSourceFor(cfg, c.contentType, c.isAnime); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestArtworkOverridesParseAndAreValidated(t *testing.T) {
	cfg := Parse(json.RawMessage(
		`{"artworkSource":"tmdb","artworkSourceAnime":"fanart","artworkSourceMovie":"nonsense"}`))
	if cfg.ArtworkSourceAnime != ArtworkFanart {
		t.Errorf("anime override = %q, want fanart", cfg.ArtworkSourceAnime)
	}
	// An unknown provider is dropped rather than pinned as the source.
	if cfg.ArtworkSourceMovie != "" {
		t.Errorf("an unknown movie override was kept: %q", cfg.ArtworkSourceMovie)
	}
	if !HasPerTypeArtwork(cfg) {
		t.Error("a config with an anime override reported none")
	}
	if HasPerTypeArtwork(Default()) {
		t.Error("a plain config reported a per-kind artwork override")
	}
}

func TestArtworkOverridesReachTheCacheKey(t *testing.T) {
	base := Default()
	for _, mutate := range []func(*Config){
		func(c *Config) { c.ArtworkSourceMovie = ArtworkFanart },
		func(c *Config) { c.ArtworkSourceSeries = ArtworkFanart },
		func(c *Config) { c.ArtworkSourceAnime = ArtworkFanart },
	} {
		c := base
		mutate(&c)
		if CacheKey(c) == CacheKey(base) {
			t.Error("a per-kind artwork override did not change the cache key")
		}
	}
}
