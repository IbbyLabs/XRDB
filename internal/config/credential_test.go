package config

import (
	"testing"
)

// v2 read several credentials without the XRDB_ prefix. A container carried
// over from it leaves the provider skipped with nothing logged or drawn.
func TestCredentialFallsBackToTheLegacyName(t *testing.T) {
	t.Setenv("XRDB_MDBLIST_API_KEY", "")
	t.Setenv("MDBLIST_API_KEY", "legacy-value")
	if got := credential("XRDB_MDBLIST_API_KEY", "MDBLIST_API_KEY"); got != "legacy-value" {
		t.Errorf("got %q, want the legacy value", got)
	}
}

func TestCredentialPrefersThePrefixedName(t *testing.T) {
	t.Setenv("XRDB_OMDB_API_KEY", "current")
	t.Setenv("OMDB_KEY", "legacy")
	if got := credential("XRDB_OMDB_API_KEY", "OMDB_API_KEY", "OMDB_KEY"); got != "current" {
		t.Errorf("got %q, want the prefixed value to win", got)
	}
}

func TestCredentialIgnoresBlankAndWhitespace(t *testing.T) {
	t.Setenv("XRDB_TRAKT_CLIENT_ID", "   ")
	t.Setenv("TRAKT_CLIENT_ID", "real")
	if got := credential("XRDB_TRAKT_CLIENT_ID", "TRAKT_CLIENT_ID"); got != "real" {
		t.Errorf("got %q, want a blank value skipped", got)
	}
	if got := credential("NOTHING_SET_AT_ALL_XRDB"); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}
