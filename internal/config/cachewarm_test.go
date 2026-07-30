package config

import (
	"testing"
	"time"
)

func TestCacheWarmSurfacesOnlyIncludesConfiguredOnes(t *testing.T) {
	w := CacheWarm{PostersURL: "https://a.dev/manifest.json", LogosURL: "   "}
	got := w.Surfaces()
	if len(got) != 1 {
		t.Fatalf("got %v, want just the poster surface", got)
	}
	if got["poster"] != "https://a.dev/manifest.json" {
		t.Errorf("poster URL = %q", got["poster"])
	}
	if _, ok := got["logo"]; ok {
		t.Error("a whitespace-only URL was treated as configured")
	}
	if len(CacheWarm{}.Surfaces()) != 0 {
		t.Error("an unconfigured warm reported surfaces")
	}
}

func TestCacheWarmDefaultsAreOffAndBounded(t *testing.T) {
	t.Setenv("XRDB_CACHE_WARM_ENABLED", "")
	w := cacheWarmFromEnv()
	if w.Enabled {
		t.Error("warming defaults to on")
	}
	if w.MaxItems <= 0 || w.Interval <= 0 {
		t.Errorf("unbounded defaults: max=%d interval=%v", w.MaxItems, w.Interval)
	}
}

func TestCacheWarmReadsItsEnvironment(t *testing.T) {
	t.Setenv("XRDB_CACHE_WARM_ENABLED", "true")
	t.Setenv("XRDB_CACHE_WARM_POSTERS_URL", "https://p.dev/manifest.json")
	t.Setenv("XRDB_CACHE_WARM_MAX_ITEMS", "500")
	t.Setenv("XRDB_CACHE_WARM_INTERVAL_HOURS", "6")

	w := cacheWarmFromEnv()
	if !w.Enabled || w.MaxItems != 500 || w.Interval != 6*time.Hour {
		t.Errorf("got %+v", w)
	}
	if w.PostersURL != "https://p.dev/manifest.json" {
		t.Errorf("posters URL = %q", w.PostersURL)
	}
}

// A nonsense value must leave the default standing rather than disable the
// bound it was meant to set.
func TestCacheWarmIgnoresNonsenseValues(t *testing.T) {
	t.Setenv("XRDB_CACHE_WARM_MAX_ITEMS", "-5")
	t.Setenv("XRDB_CACHE_WARM_INTERVAL_HOURS", "not-a-number")
	w := cacheWarmFromEnv()
	if w.MaxItems <= 0 || w.Interval <= 0 {
		t.Errorf("a bad value removed a bound: %+v", w)
	}
}

func TestEnvTruthyAcceptsTheUsualSpellings(t *testing.T) {
	for _, on := range []string{"1", "true", "TRUE", "yes", "on", " true "} {
		t.Setenv("XRDB_TEST_FLAG", on)
		if !envTruthy("XRDB_TEST_FLAG") {
			t.Errorf("%q did not read as on", on)
		}
	}
	for _, off := range []string{"", "0", "false", "no", "maybe"} {
		t.Setenv("XRDB_TEST_FLAG", off)
		if envTruthy("XRDB_TEST_FLAG") {
			t.Errorf("%q read as on", off)
		}
	}
}
