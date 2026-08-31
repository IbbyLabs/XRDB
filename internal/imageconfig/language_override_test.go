package imageconfig

import "testing"

// The value joins the render cache key, so what it accepts bounds the key space.
// The rejected cases are the point of the test: an unbounded accept is the fault
// this guard exists to prevent, and it would pass any test that only checked the
// accepted ones.
func TestApplyLanguageOverride(t *testing.T) {
	for _, tc := range []struct {
		raw     string
		applied bool
		want    string
	}{
		{raw: "fr", applied: true, want: "fr"},
		{raw: "FR", applied: true, want: "fr"},
		{raw: " ja ", applied: true, want: "ja"},
		// A region is accepted and reduced, matching what a stored config does.
		{raw: "es-MX", applied: true, want: "es"},
		{raw: "pt_BR", applied: true, want: "pt"},
		{raw: "original", applied: true, want: "original"},
		// Rejected: unbounded or malformed input must not reach the key.
		{raw: "", applied: false, want: "en"},
		{raw: "english", applied: false, want: "en"},
		{raw: "e", applied: false, want: "en"},
		{raw: "fr-FRA", applied: false, want: "en"},
		{raw: "fr;rm -rf", applied: false, want: "en"},
		{raw: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", applied: false, want: "en"},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			cfg := Config{Language: "en"}
			got := ApplyLanguageOverride(&cfg, tc.raw)
			if got != tc.applied {
				t.Errorf("applied=%v, want %v", got, tc.applied)
			}
			if cfg.Language != tc.want {
				t.Errorf("language=%q, want %q", cfg.Language, tc.want)
			}
		})
	}
}

// It moves the language alone. Coupling text preference to it would turn off a
// caller's original-language art on a request that only asked for English.
func TestApplyLanguageOverrideTouchesNothingElse(t *testing.T) {
	cfg := Default()
	before := cfg
	if !ApplyLanguageOverride(&cfg, "fr") {
		t.Fatal("fr was rejected, so this proves nothing about what else moved")
	}
	before.Language = cfg.Language
	if CacheKey(cfg) != CacheKey(before) {
		t.Error("something other than the language changed")
	}
}

// A rejected value must leave the config untouched rather than blanking it.
func TestARejectedOverrideChangesNothing(t *testing.T) {
	cfg := Default()
	cfg.Language = "ja"
	key := CacheKey(cfg)
	if ApplyLanguageOverride(&cfg, "not-a-language") {
		t.Fatal("a malformed value was accepted")
	}
	if CacheKey(cfg) != key {
		t.Error("a rejected value changed the config")
	}
}

// The override is only worth applying before the key is built if the language
// is in the key at all. Without this the ordering comment in the handler rests
// on nothing.
func TestAnOverriddenLanguageMovesTheCacheKey(t *testing.T) {
	base := Default()
	fr, ja := base, base
	if !ApplyLanguageOverride(&fr, "fr") || !ApplyLanguageOverride(&ja, "ja") {
		t.Fatal("a valid override was rejected, so the keys below prove nothing")
	}
	if CacheKey(fr) == CacheKey(ja) {
		t.Error("two languages share a cache key, so one would be served the other's render")
	}
	if CacheKey(fr) == CacheKey(base) {
		t.Error("an overridden language shares the key with the un-overridden config")
	}
}
