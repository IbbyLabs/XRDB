package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// FR-223: only the services someone cares about, most wanted first.
func TestSelectProvidersKeepsTheAllowedInPreferenceOrder(t *testing.T) {
	all := []provider.WatchProvider{
		{Name: "Fubo"}, {Name: "Hulu"}, {Name: "Netflix Standard with Ads"},
		{Name: "Apple TV Plus"}, {Name: "HBO Max"}, {Name: "Google Play Movies", Rental: true},
	}
	cfg := imageconfig.Default()
	cfg.ProvidersAllow = []string{"Apple TV+", "Max", "Netflix", "Google Play Movies"}

	got := names(selectProviders(all, cfg))
	want := []string{"Apple TV Plus", "HBO Max", "Netflix Standard with Ads", "Google Play Movies"}
	if !equalStrings(got, want) {
		t.Errorf("allowed = %v, want %v", got, want)
	}

	cfg.ProvidersSubscriptionOnly = true
	if got := names(selectProviders(all, cfg)); len(got) != 3 || got[2] != "Netflix Standard with Ads" {
		t.Errorf("subscription only = %v, want the rental dropped", got)
	}

	if got := selectProviders(all, imageconfig.Default()); len(got) != len(all) {
		t.Errorf("no allow list kept %d of %d", len(got), len(all))
	}
}

func names(ps []provider.WatchProvider) []string {
	out := make([]string, len(ps))
	for i, p := range ps {
		out[i] = p.Name
	}
	return out
}
