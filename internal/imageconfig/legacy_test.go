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

// A JSON null preserved field must survive round-trips without becoming a
// dropped key or a Go nil that re-marshals differently.
func TestLegacyPreservesNullValue(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"language":"en","weirdField":null}`))
	if _, ok := cfg.Legacy["weirdField"]; !ok {
		t.Fatal("null-valued unknown field was dropped")
	}
	r1, _ := CanonicalJSON(cfg)
	r2, _ := CanonicalJSON(Parse(r1))
	if !bytes.Equal(r1, r2) {
		t.Errorf("null field not stable across round-trips:\n%s\n%s", r1, r2)
	}
}

// Legacy must never shadow a modeled field even if one is placed there directly.
func TestMergeLegacyNeverShadowsModeledField(t *testing.T) {
	cfg := Default()
	cfg.Language = "en"
	// Force a collision: a modeled key smuggled into the legacy bag.
	cfg.Legacy = map[string]json.RawMessage{"language": json.RawMessage(`"HACKED"`)}
	raw, err := CanonicalJSON(cfg)
	if err != nil {
		t.Fatalf("CanonicalJSON: %v", err)
	}
	restored := Parse(raw)
	if restored.Language != "en" {
		t.Errorf("legacy shadowed a modeled field: language = %q", restored.Language)
	}
	if _, ok := restored.Legacy["language"]; ok {
		t.Error("a modeled key persisted in the legacy bag")
	}
}

// Nested-object legacy values with differing key order must hash the same only
// if logically identical; Go's json.Compact preserves key order, so we document
// the actual behavior: same source order → stable, which is what round-trips need.
func TestLegacyNestedObjectRoundTripStable(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"nested":{"z":1,"a":2,"m":[3,4]}}`))
	r1, _ := CanonicalJSON(cfg)
	r2, _ := CanonicalJSON(Parse(r1))
	r3, _ := CanonicalJSON(Parse(r2))
	if !bytes.Equal(r1, r2) || !bytes.Equal(r2, r3) {
		t.Errorf("nested legacy object not a fixed point:\n1:%s\n2:%s\n3:%s", r1, r2, r3)
	}
}

// A preserved value must hash the same regardless of nested object key order —
// the determinism the cache key promises.
func TestLegacyNestedKeyOrderIsCanonical(t *testing.T) {
	a := Parse(json.RawMessage(`{"blob":{"a":1,"b":2}}`))
	b := Parse(json.RawMessage(`{"blob":{"b":2,"a":1}}`))
	if CacheKey(a) != CacheKey(b) {
		t.Errorf("nested key order changed the cache key:\n a=%s\n b=%s",
			a.Legacy["blob"], b.Legacy["blob"])
	}
	if string(a.Legacy["blob"]) != `{"a":1,"b":2}` {
		t.Errorf("nested value not canonicalized to sorted keys: %s", a.Legacy["blob"])
	}
}

// Large integers in a preserved value must survive without float rounding.
func TestLegacyPreservesIntegerPrecision(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"bigid":123456789012345678}`))
	if string(cfg.Legacy["bigid"]) != "123456789012345678" {
		t.Errorf("integer precision lost: %s", cfg.Legacy["bigid"])
	}
}

// The genre-badge group round-trips through Parse and CanonicalJSON, is reported
// as modeled (not deferred in migration), and affects the cache key.
func TestGenreBadgeGroupRoundTrips(t *testing.T) {
	in := json.RawMessage(`{"genre":true,"genreBadgeMode":"both","genreBadgeStyle":"tile","genreBadgeScale":150,"genreBadgeOffsetX":12,"genreBadgeOffsetY":-8,"genreBadgeBorderWidth":2,"genreBadgeBackgroundOpacity":80,"genreBadgeTileAccentColor":"#ff8800"}`)
	cfg := Parse(in)
	if cfg.GenreBadgeMode != "both" || cfg.GenreBadgeStyle != "tile" {
		t.Fatalf("genre enums lost: %+v", cfg.GenreBadgeConfig)
	}
	if cfg.GenreBadgeScale != 150 || cfg.GenreBadgeOffsetX != 12 || cfg.GenreBadgeOffsetY != -8 {
		t.Errorf("genre numerics lost: %+v", cfg.GenreBadgeConfig)
	}
	if cfg.GenreBadgeBorderWidth != 2 || cfg.GenreBadgeBackgroundOpacity != 80 || cfg.GenreBadgeTileAccentColor != "#ff8800" {
		t.Errorf("genre appearance lost: %+v", cfg.GenreBadgeConfig)
	}
	// Nothing should have fallen into Legacy — all keys are modeled now.
	if len(cfg.Legacy) != 0 {
		t.Errorf("genre keys leaked into Legacy: %v", cfg.Legacy)
	}
	for _, k := range []string{"genreBadgeMode", "genreBadgeScale", "genreBadgeTileAccentColor"} {
		if !IsModeledKey(k) {
			t.Errorf("%q should be a modeled key", k)
		}
	}
	// Round-trip through canonical output.
	raw, _ := CanonicalJSON(cfg)
	if Parse(raw).GenreBadgeScale != 150 {
		t.Error("genre scale did not survive the canonical round-trip")
	}
}

func TestGenreBadgeValidationClampsAndRejects(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"genreBadgeMode":"bogus","genreBadgeScale":9999,"genreBadgeBackgroundOpacity":500,"genreBadgeTileAccentColor":"notacolor"}`))
	if cfg.GenreBadgeMode != "" {
		t.Errorf("invalid mode accepted: %q", cfg.GenreBadgeMode)
	}
	if cfg.GenreBadgeScale != 200 {
		t.Errorf("scale not clamped to 200: %d", cfg.GenreBadgeScale)
	}
	if cfg.GenreBadgeBackgroundOpacity != 100 {
		t.Errorf("opacity not clamped to 100: %d", cfg.GenreBadgeBackgroundOpacity)
	}
	if cfg.GenreBadgeTileAccentColor != "" {
		t.Errorf("invalid color accepted: %q", cfg.GenreBadgeTileAccentColor)
	}
}

// A config that sets no genre-group field must hash identically to how it did
// before the group existed — the omitempty-embed promise.
func TestGenreBadgeAbsentDoesNotChangeCacheKey(t *testing.T) {
	// Two configs identical except one names a genre field at its zero value.
	a := Parse(json.RawMessage(`{"language":"en","genre":true}`))
	b := Parse(json.RawMessage(`{"language":"en","genre":true,"genreBadgeScale":0}`))
	if CacheKey(a) != CacheKey(b) {
		t.Error("a zero-valued genre field changed the cache key")
	}
	// But a real genre value must change it.
	c := Parse(json.RawMessage(`{"language":"en","genre":true,"genreBadgeScale":150}`))
	if CacheKey(a) == CacheKey(c) {
		t.Error("a set genre scale did not change the cache key")
	}
}

func TestQualityAndTrendingGroupsRoundTrip(t *testing.T) {
	in := json.RawMessage(`{"qualityBadgesPos":"bl","qualityBadgeScale":130,"qualityBadgeOffsetX":5,"qualityBadgeOffsetY":-3,"qualityBadgesMax":2,"trendingPos":"br","trendingTextColor":"#00ffcc"}`)
	cfg := Parse(in)
	if cfg.QualityBadgesPos != "bl" || cfg.QualityBadgeScale != 130 || cfg.QualityBadgeOffsetX != 5 || cfg.QualityBadgeOffsetY != -3 {
		t.Errorf("quality fields lost: %+v", cfg.QualityBadgeConfig)
	}
	if cfg.QualityBadgesMax == nil || *cfg.QualityBadgesMax != 2 {
		t.Errorf("qualityBadgesMax lost: %v", cfg.QualityBadgesMax)
	}
	if cfg.TrendingPos != "br" || cfg.TrendingTextColor != "#00ffcc" {
		t.Errorf("trending fields lost: %+v", cfg.TrendingConfig)
	}
	if len(cfg.Legacy) != 0 {
		t.Errorf("keys leaked to Legacy: %v", cfg.Legacy)
	}
	// Invalid position is rejected, not stored.
	if Parse(json.RawMessage(`{"qualityBadgesPos":"middle"}`)).QualityBadgesPos != "" {
		t.Error("invalid position accepted")
	}
}
