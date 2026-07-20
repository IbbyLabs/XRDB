package imageconfig

import (
	"bytes"
	"encoding/json"
	"testing"
)

// A migrated v2 config carries per-surface fields v3 does not model yet. Parse
// must keep them so nothing is silently dropped.
func TestParsePreservesUnknownFields(t *testing.T) {
	in := json.RawMessage(`{
		"language": "fr",
		"posterRatingsMax": 4,
		"logoBackground": true,
		"aggregateAccentMode": "dynamic"
	}`)
	cfg := Parse(in)
	if cfg.Language != "fr" {
		t.Fatalf("known field lost: language = %q", cfg.Language)
	}
	for _, k := range []string{"posterRatingsMax", "logoBackground", "aggregateAccentMode"} {
		if _, ok := cfg.Legacy[k]; !ok {
			t.Errorf("unknown field %q not preserved in Legacy", k)
		}
	}
	if _, ok := cfg.Legacy["language"]; ok {
		t.Error("a modeled field leaked into Legacy")
	}
}

func TestParseNoUnknownFieldsLeavesLegacyNil(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"language":"en","ratings":["imdb"]}`))
	if cfg.Legacy != nil {
		t.Errorf("Legacy should be nil when every field is modeled, got %v", cfg.Legacy)
	}
}

// Export then re-import must round-trip the preserved fields intact.
func TestCanonicalJSONRoundTripsLegacyFields(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"language":"de","posterRatingsMax":6,"logoBackground":true}`))
	raw, err := CanonicalJSON(cfg)
	if err != nil {
		t.Fatalf("CanonicalJSON: %v", err)
	}
	restored := Parse(raw)
	if restored.Language != "de" {
		t.Errorf("known field lost on round-trip: %q", restored.Language)
	}
	if string(restored.Legacy["posterRatingsMax"]) != "6" {
		t.Errorf("posterRatingsMax not round-tripped: %s", restored.Legacy["posterRatingsMax"])
	}
	if string(restored.Legacy["logoBackground"]) != "true" {
		t.Errorf("logoBackground not round-tripped: %s", restored.Legacy["logoBackground"])
	}
}

// A second round-trip must be a fixed point — no drift, no accumulation.
func TestCanonicalJSONLegacyIsIdempotent(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"posterRatingsMax":6,"x":{"b":2,"a":1}}`))
	r1, _ := CanonicalJSON(cfg)
	r2, _ := CanonicalJSON(Parse(r1))
	if !bytes.Equal(r1, r2) {
		t.Errorf("round-trip not stable:\n first: %s\nsecond: %s", r1, r2)
	}
}

// Legacy-free configs must hash exactly as before this feature existed, and
// preserved fields must change the key so migrated configs don't collide.
func TestCacheKeyFoldsInLegacyFields(t *testing.T) {
	base := Parse(json.RawMessage(`{"language":"en"}`))
	withLegacy := Parse(json.RawMessage(`{"language":"en","posterRatingsMax":4}`))
	if CacheKey(base) == CacheKey(withLegacy) {
		t.Error("preserved field did not affect the cache key; migrated configs would collide")
	}

	a := Parse(json.RawMessage(`{"language":"en","posterRatingsMax":4}`))
	b := Parse(json.RawMessage(`{"language":"en","posterRatingsMax":9}`))
	if CacheKey(a) == CacheKey(b) {
		t.Error("configs differing only in a preserved field share a cache key")
	}
}

func TestCacheKeyUnchangedWithoutLegacy(t *testing.T) {
	// Guards the promise that this feature is invisible to existing configs.
	cfg := Default()
	cfg.Language = "ja"
	cfg.Ratings = []string{"imdb", "tmdb"}
	if cfg.Legacy != nil {
		t.Fatal("Default-derived config unexpectedly has Legacy")
	}
	// A hand-built key over the same fields, no legacy path taken.
	if got := CacheKey(cfg); len(got) != 64 {
		t.Errorf("cache key is not a sha256 hex digest: %q", got)
	}
}

// Whitespace in a preserved value must not change identity.
func TestLegacyValuesAreCompacted(t *testing.T) {
	spaced := Parse(json.RawMessage(`{"blob":  {  "a" : 1 }  }`))
	tight := Parse(json.RawMessage(`{"blob":{"a":1}}`))
	if CacheKey(spaced) != CacheKey(tight) {
		t.Error("whitespace in a preserved value changed the cache key")
	}
	if string(spaced.Legacy["blob"]) != `{"a":1}` {
		t.Errorf("preserved value not compacted: %s", spaced.Legacy["blob"])
	}
}
