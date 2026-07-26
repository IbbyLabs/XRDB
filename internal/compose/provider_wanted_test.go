package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func cfgWith(ratings []string, topRated bool) imageconfig.Config {
	cfg := imageconfig.Default()
	cfg.Ratings = ratings
	cfg.TopRated = topRated
	return cfg
}

// The whole point of the declaration is to keep a source nobody asked for off
// the render path, where it costs a network round trip per render.
func TestUnselectedSourceIsSkipped(t *testing.T) {
	simkl := provider.NewSIMKL("id")
	if providerWanted(simkl, cfgWith([]string{"imdb", "tmdb"}, false)) {
		t.Error("simkl was called for a config that selected neither of its sources")
	}
	if !providerWanted(simkl, cfgWith([]string{"imdb", "simkl"}, false)) {
		t.Error("simkl was skipped for a config that selected it")
	}
}

// One matching source out of many is enough; MDBList supplies a spread.
func TestMultiSourceProviderMatchesOnAny(t *testing.T) {
	m := provider.NewMDBList("k")
	if !providerWanted(m, cfgWith([]string{"letterboxd"}, false)) {
		t.Error("mdblist was skipped despite supplying letterboxd")
	}
	if providerWanted(m, cfgWith([]string{"simkl"}, false)) {
		t.Error("mdblist was called for a source it cannot supply")
	}
}

// The rank rides along with the rating, so the badge has to keep its source in
// even when that source's score is not on the poster.
func TestRankingSourceSurvivesForTheTopRatedBadge(t *testing.T) {
	d := provider.NewIMDbDataset("")
	d.EnableTopRated()
	if providerWanted(d, cfgWith([]string{"tmdb"}, false)) {
		t.Error("the dataset was called with neither its rating nor the badge selected")
	}
	if !providerWanted(d, cfgWith([]string{"tmdb"}, true)) {
		t.Error("the top-rated badge lost its rank source")
	}
}

// A ranking provider that has the feature switched off is not worth calling
// for the rank alone.
func TestRankExemptionNeedsTheFeatureOn(t *testing.T) {
	d := provider.NewIMDbDataset("")
	if providerWanted(d, cfgWith([]string{"tmdb"}, true)) {
		t.Error("a dataset with top-rated disabled was kept for the badge")
	}
}

// An empty allow-list means nothing is selected rather than everything, which
// is the rule the rating average already follows.
func TestEmptySelectionWantsNothing(t *testing.T) {
	if providerWanted(provider.NewSIMKL("id"), cfgWith(nil, false)) {
		t.Error("an empty selection still fetched a source")
	}
}

// Undeclared sources keep the old behaviour: always called.
func TestUndeclaredProviderIsAlwaysCalled(t *testing.T) {
	if !providerWanted(undeclaredStub{}, cfgWith([]string{"imdb"}, false)) {
		t.Error("a provider that declares nothing should still be called")
	}
}

type undeclaredStub struct{}

func (undeclaredStub) Name() string { return "undeclared" }
func (undeclaredStub) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return nil, nil
}
