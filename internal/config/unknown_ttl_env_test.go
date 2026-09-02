package config

import (
	"strings"
	"testing"
)

// A TTL variable naming something outside the tunable set was read by nothing
// and said nothing, so a typo behaved exactly like a setting that worked.
func TestAnUnreadTTLVariableIsReported(t *testing.T) {
	cases := []struct {
		name     string
		env      string
		reported bool
	}{
		{"a tunable provider", "XRDB_TTL_TMDB", false},
		{"a tunable surface", "XRDB_TTL_SURFACE_POSTER", false},
		{"a provider outside the set", "XRDB_TTL_MEDIUX", true},
		{"a misspelled provider", "XRDB_TTL_MDLIST", true},
		{"a surface outside the set", "XRDB_TTL_SURFACE_BANNER", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(tc.env, "4")
			got := false
			for _, v := range UnknownTTLEnvVars() {
				if v == tc.env {
					got = true
				}
			}
			if got != tc.reported {
				t.Errorf("%s reported=%v, want %v", tc.env, got, tc.reported)
			}
		})
	}
}

// The warning has to stay quiet for every name the loader actually reads, or it
// fires on a correct config the day a provider or surface is added.
func TestEveryTunableNameIsAccepted(t *testing.T) {
	for _, name := range TTLProviders {
		t.Setenv(ProviderTTLEnvVar(name), "4")
	}
	for _, name := range TTLSurfaces {
		t.Setenv(SurfaceTTLEnvVar(name), "4")
	}
	if unknown := UnknownTTLEnvVars(); len(unknown) > 0 {
		t.Errorf("a tunable name was reported as unread: %s", strings.Join(unknown, ", "))
	}
}

// A variable outside the family is not this check's business.
func TestAVariableOutsideTheTTLFamilyIsIgnored(t *testing.T) {
	t.Setenv("XRDB_DB", "/tmp/x.db")
	for _, v := range UnknownTTLEnvVars() {
		if v == "XRDB_DB" {
			t.Fatal("a non-TTL variable was reported")
		}
	}
}
