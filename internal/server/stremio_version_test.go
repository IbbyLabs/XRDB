package server

import "testing"

// Stremio parses the manifest's version as strict semver and refuses to install
// the addon when it does not parse. The release build carried a leading "v" and
// the dev build a dated string, so neither could be installed.
func TestManifestVersionIsAlwaysSemver(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"v3.18.1", "3.18.1"},
		{"3.18.1", "3.18.1"},
		{"V3.18.1", "3.18.1"},
		{" v3.18.1 ", "3.18.1"},
		{"3.18.1-rc.1", "3.18.1-rc.1"},
		{"dev.20260730.0636.0cd20f5", "0.0.0-dev.20260730.0636.0cd20f5"},
		{"", "0.0.0"},
		{"unknown", "0.0.0-unknown"},
	} {
		if got := manifestVersion(tc.in); got != tc.want {
			t.Errorf("manifestVersion(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// A leading digit is what Stremio's parser demands first; anything else is the
// failure the reporter saw ("unexpected character 'd'").
func TestManifestVersionStartsWithADigit(t *testing.T) {
	for _, in := range []string{"v3.18.1", "dev.20260730.0636.0cd20f5", "", "unknown", "v0.0.1-beta"} {
		got := manifestVersion(in)
		if got == "" || got[0] < '0' || got[0] > '9' {
			t.Errorf("manifestVersion(%q) = %q, which does not start with a digit", in, got)
		}
	}
}
