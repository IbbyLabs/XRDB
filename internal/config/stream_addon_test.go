package config

import "testing"

// A quality badge that is not true of the title is decoration, so the check has
// to hold on an instance nobody configured, not only on one that opted in.
func TestTheStreamAddonDefaultsToAPublicInstance(t *testing.T) {
	t.Setenv("XRDB_STREAM_ADDON_URL", "")
	if got := streamAddonURL(); got != DefaultStreamAddonURL {
		t.Errorf("unset = %q, want the default %q", got, DefaultStreamAddonURL)
	}
}

func TestTheStreamAddonCanBeTurnedOff(t *testing.T) {
	for _, raw := range []string{"off", "OFF", "none", "disabled", "false", " off "} {
		t.Setenv("XRDB_STREAM_ADDON_URL", raw)
		if got := streamAddonURL(); got != "" {
			t.Errorf("%q = %q, want it disabled", raw, got)
		}
	}
}

func TestAConfiguredStreamAddonWins(t *testing.T) {
	t.Setenv("XRDB_STREAM_ADDON_URL", "  http://comet:2020  ")
	if got := streamAddonURL(); got != "http://comet:2020" {
		t.Errorf("got %q, want the configured addon", got)
	}
}
