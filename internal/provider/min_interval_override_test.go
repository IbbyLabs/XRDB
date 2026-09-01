package provider

import (
	"testing"
	"time"
)

// A source's host is movable — XRDB_JIKAN_URL points the MAL source at a
// self-hosted Jikan — so the interval that protects the public service has to
// be settable per source (FR-192).
func TestAnOverrideReplacesATablesInterval(t *testing.T) {
	prev := minIntervalOverrides
	minIntervalOverrides = map[string]time.Duration{"mal": 50 * time.Millisecond}
	t.Cleanup(func() { minIntervalOverrides = prev })

	if got := rateLimitFor("mal").MinInterval; got != 50*time.Millisecond {
		t.Errorf("mal MinInterval = %v, want 50ms", got)
	}
	if got := rateLimitFor("mal").MaxRetries; got != 2 {
		t.Errorf("mal MaxRetries = %d, want the table's 2", got)
	}
	if got := rateLimitFor("anilist").MinInterval; got != 2*time.Second {
		t.Errorf("anilist MinInterval = %v, want the table's 2s", got)
	}
}

// A source with no table entry can be given an interval without being listed
// (FR-177, second half). TMDB has none by default and that is deliberate.
func TestAnOverrideReachesASourceWithNoTableEntry(t *testing.T) {
	if got := rateLimitFor("tmdb").MinInterval; got != 0 {
		t.Fatalf("tmdb paces by default at %v; the default is meant to be unpaced", got)
	}

	prev := minIntervalOverrides
	minIntervalOverrides = map[string]time.Duration{"tmdb": 250 * time.Millisecond}
	t.Cleanup(func() { minIntervalOverrides = prev })

	if got := rateLimitFor("tmdb").MinInterval; got != 250*time.Millisecond {
		t.Errorf("tmdb MinInterval = %v, want 250ms", got)
	}
	if got := rateLimitFor("tmdb").MaxRetries; got != defaultRateLimit.MaxRetries {
		t.Errorf("tmdb MaxRetries = %d, want the default %d", got, defaultRateLimit.MaxRetries)
	}
}

func TestMinIntervalOverridesAreReadFromTheEnvironment(t *testing.T) {
	t.Setenv("XRDB_MAL_MIN_INTERVAL_SECONDS", "0.05")
	t.Setenv("XRDB_TRAKT_MIN_INTERVAL_SECONDS", "2.5")
	t.Setenv("XRDB_ANILIST_MIN_INTERVAL_SECONDS", "99")
	t.Setenv("XRDB_MDBLIST_MIN_INTERVAL_SECONDS", "")

	got := readMinIntervalOverrides()

	if got["mal"] != 50*time.Millisecond {
		t.Errorf("mal = %v, want 50ms", got["mal"])
	}
	if got["trakt"] != 2500*time.Millisecond {
		t.Errorf("trakt = %v, want 2.5s", got["trakt"])
	}
	// Out of bounds and empty are both refused, leaving the table's value.
	if _, set := got["anilist"]; set {
		t.Error("99s was accepted; the upper bound is 10")
	}
	if _, set := got["mdblist"]; set {
		t.Error("an empty value was taken as an override")
	}
}
