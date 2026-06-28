package imageconfig

import (
	"encoding/json"
	"testing"
)

func TestDefaultReturnsExpectedValues(t *testing.T) {
	d := Default()
	if d.Size != SizeNormal {
		t.Errorf("Size: got %q, want %q", d.Size, SizeNormal)
	}
	if d.ArtworkSource != ArtworkTMDB {
		t.Errorf("ArtworkSource: got %q, want %q", d.ArtworkSource, ArtworkTMDB)
	}
	if d.Language != "en" {
		t.Errorf("Language: got %q, want %q", d.Language, "en")
	}
	if d.RatingsLayout != LayoutBottom {
		t.Errorf("RatingsLayout: got %q, want %q", d.RatingsLayout, LayoutBottom)
	}
	if len(d.Ratings) == 0 {
		t.Error("expected default ratings to be non-empty")
	}
}

func TestParseEmptyReturnsDefault(t *testing.T) {
	got := Parse(nil)
	want := Default()
	if got.Size != want.Size || got.Language != want.Language {
		t.Errorf("Parse(nil) != Default(): got %+v", got)
	}
}

func TestParseOverridesFields(t *testing.T) {
	raw := json.RawMessage(`{
		"size": "large",
		"artworkSource": "fanart",
		"language": "JA",
		"textPreference": "clean",
		"ratings": ["rt", "imdb", "tmdb"],
		"ratingsLayout": "top",
		"ageRating": false
	}`)
	cfg := Parse(raw)
	if cfg.Size != SizeLarge {
		t.Errorf("Size: got %q, want large", cfg.Size)
	}
	if cfg.ArtworkSource != ArtworkFanart {
		t.Errorf("ArtworkSource: got %q, want fanart", cfg.ArtworkSource)
	}
	if cfg.Language != "ja" {
		t.Errorf("Language: got %q, want ja (lowercased)", cfg.Language)
	}
	if cfg.TextPreference != TextClean {
		t.Errorf("TextPreference: got %q, want clean", cfg.TextPreference)
	}
	if cfg.RatingsLayout != LayoutTop {
		t.Errorf("RatingsLayout: got %q, want top", cfg.RatingsLayout)
	}
	if cfg.AgeRating {
		t.Error("expected AgeRating=false")
	}
	if len(cfg.Ratings) != 3 {
		t.Errorf("expected 3 ratings, got %d", len(cfg.Ratings))
	}
}

func TestParseNormalizesAliases(t *testing.T) {
	cases := []struct {
		field string
		raw   string
		want  string
	}{
		{"size", `{"size":"uhd"}`, "4k"},
		{"size", `{"size":"verylarge"}`, "4k"},
		{"size", `{"size":"standard"}`, "normal"},
		{"artworkSource", `{"artworkSource":"imdb"}`, "cinemeta"},
		{"ratingsLayout", `{"ratingsLayout":"split-side"}`, "split-side"},
	}
	for _, tc := range cases {
		cfg := Parse(json.RawMessage(tc.raw))
		var got string
		switch tc.field {
		case "size":
			got = string(cfg.Size)
		case "artworkSource":
			got = string(cfg.ArtworkSource)
		case "ratingsLayout":
			got = string(cfg.RatingsLayout)
		}
		if got != tc.want {
			t.Errorf("field %s raw %s: got %q, want %q", tc.field, tc.raw, got, tc.want)
		}
	}
}

func TestParseInvalidFallsBackToDefault(t *testing.T) {
	raw := json.RawMessage(`{"size":"huge","artworkSource":"netflix","ratingsLayout":"diagonal"}`)
	cfg := Parse(raw)
	def := Default()
	if cfg.Size != def.Size {
		t.Errorf("invalid size should fall back to default, got %q", cfg.Size)
	}
	if cfg.ArtworkSource != def.ArtworkSource {
		t.Errorf("invalid artworkSource should fall back to default, got %q", cfg.ArtworkSource)
	}
	if cfg.RatingsLayout != def.RatingsLayout {
		t.Errorf("invalid ratingsLayout should fall back to default, got %q", cfg.RatingsLayout)
	}
}

func TestParseDeduplicatesRatings(t *testing.T) {
	raw := json.RawMessage(`{"ratings":["imdb","tmdb","imdb","  tmdb  "]}`)
	cfg := Parse(raw)
	if len(cfg.Ratings) != 2 {
		t.Errorf("expected 2 deduplicated ratings, got %d: %v", len(cfg.Ratings), cfg.Ratings)
	}
}

func TestParseSurfaceFlatConfigAppliesToEverySurface(t *testing.T) {
	// A legacy flat config (no "surfaces" key) must resolve identically for
	// every surface so profiles saved before per-surface settings keep working.
	raw := json.RawMessage(`{"size":"large","artworkSource":"fanart","language":"ja"}`)
	for _, surface := range Surfaces {
		cfg := ParseSurface(raw, surface)
		if cfg.Size != SizeLarge {
			t.Errorf("surface %q Size: got %q, want large", surface, cfg.Size)
		}
		if cfg.ArtworkSource != ArtworkFanart {
			t.Errorf("surface %q ArtworkSource: got %q, want fanart", surface, cfg.ArtworkSource)
		}
		if cfg.Language != "ja" {
			t.Errorf("surface %q Language: got %q, want ja", surface, cfg.Language)
		}
	}
}

func TestParseSurfaceResolvesEachSurfaceIndependently(t *testing.T) {
	raw := json.RawMessage(`{
		"v": 2,
		"surfaces": {
			"poster":   {"size":"4k","artworkSource":"tmdb","ratingsLayout":"bottom"},
			"backdrop": {"size":"normal","artworkSource":"fanart","ratingsLayout":"none"}
		}
	}`)

	poster := ParseSurface(raw, "poster")
	if poster.Size != Size4K {
		t.Errorf("poster Size: got %q, want 4k", poster.Size)
	}
	if poster.ArtworkSource != ArtworkTMDB {
		t.Errorf("poster ArtworkSource: got %q, want tmdb", poster.ArtworkSource)
	}
	if poster.RatingsLayout != LayoutBottom {
		t.Errorf("poster RatingsLayout: got %q, want bottom", poster.RatingsLayout)
	}

	backdrop := ParseSurface(raw, "backdrop")
	if backdrop.Size != SizeNormal {
		t.Errorf("backdrop Size: got %q, want normal", backdrop.Size)
	}
	if backdrop.ArtworkSource != ArtworkFanart {
		t.Errorf("backdrop ArtworkSource: got %q, want fanart", backdrop.ArtworkSource)
	}
	if backdrop.RatingsLayout != LayoutNone {
		t.Errorf("backdrop RatingsLayout: got %q, want none", backdrop.RatingsLayout)
	}
}

func TestParseSurfaceMissingSurfaceFallsBackToDefault(t *testing.T) {
	// Envelope present but the requested surface is absent → Default().
	raw := json.RawMessage(`{"surfaces":{"poster":{"size":"4k"}}}`)
	got := ParseSurface(raw, "logo")
	want := Default()
	if got.Size != want.Size || got.ArtworkSource != want.ArtworkSource {
		t.Errorf("missing surface should fall back to Default(), got %+v", got)
	}
}

func TestParseSurfaceEmptyReturnsDefault(t *testing.T) {
	got := ParseSurface(nil, "poster")
	want := Default()
	if got.Size != want.Size || got.Language != want.Language {
		t.Errorf("ParseSurface(nil) != Default(): got %+v", got)
	}
}

func TestCacheKeyStableForSameConfig(t *testing.T) {
	cfg := Default()
	k1 := CacheKey(cfg)
	k2 := CacheKey(cfg)
	if k1 != k2 {
		t.Error("CacheKey not stable for same config")
	}
}

func TestCacheKeyIndependentOfRatingsOrder(t *testing.T) {
	cfg1 := Default()
	cfg1.Ratings = []string{"tmdb", "imdb", "rt"}
	cfg2 := Default()
	cfg2.Ratings = []string{"rt", "tmdb", "imdb"}
	if CacheKey(cfg1) != CacheKey(cfg2) {
		t.Error("CacheKey should be independent of ratings order (sorted before hashing)")
	}
}

func TestCacheKeyDiffersForDifferentConfigs(t *testing.T) {
	c1 := Default()
	c2 := Default()
	c2.Language = "ja"
	if CacheKey(c1) == CacheKey(c2) {
		t.Error("expected different cache keys for different language")
	}
}

func TestCanonicalJSONRoundTrip(t *testing.T) {
	cfg := Default()
	cfg.Language = "fr"
	cfg.Ratings = []string{"tmdb", "rt", "letterboxd"}

	raw, err := CanonicalJSON(cfg)
	if err != nil {
		t.Fatalf("CanonicalJSON: %v", err)
	}
	restored := Parse(raw)
	if restored.Language != "fr" {
		t.Errorf("round-trip Language: got %q, want fr", restored.Language)
	}
	if len(restored.Ratings) != 3 {
		t.Errorf("round-trip Ratings: got %v", restored.Ratings)
	}
}
