package imageconfig

import (
	"encoding/json"
	"strings"
	"testing"
)

// The list off a real migrated profile: video formats mixed with streaming
// services, awards and settings that are their own flag here. Every token
// without a tile used to be drawn as its own name in capitals.
var realV2BadgeList = []string{
	"releasestatus", "certification", "trendingtoday", "trendingweek", "top10",
	"top25", "bingeready", "fanfavourite", "toprated", "oscarwinner",
	"oscarnominee", "emmywinner", "emmynominee", "netflix", "hbo", "primevideo",
	"disneyplus", "appletvplus", "hulu", "paramountplus", "peacock", "4k", "hd",
	"bluray", "remux", "bdremux", "dolbyvision", "dolbyatmos",
}

func TestNormalizeBadgesKeepsOnlyDrawableTiles(t *testing.T) {
	badges, features := normalizeBadges(realV2BadgeList)

	want := map[string]bool{"4k": true, "hd": true, "bluray": true, "remux": true,
		"bdremux": true, "dv": true, "atmos": true}
	if len(badges) != len(want) {
		t.Errorf("kept %v, want %d tiles", badges, len(want))
	}
	for _, b := range badges {
		if !want[b] {
			t.Errorf("kept %q, which has no tile of its own", b)
		}
	}
	// v2 spells these out; the renderer knows the short form.
	if !contains(badges, "dv") || !contains(badges, "atmos") {
		t.Errorf("dolbyvision/dolbyatmos did not map to dv/atmos: %v", badges)
	}
	// The features those other tokens stood for stay switched on.
	for _, f := range []string{featureAgeRating, featureRelease, featureTrending, featureTopRated, featureProviders} {
		if !features[f] {
			t.Errorf("feature %q was lost", f)
		}
	}
}

// A token nobody can draw is dropped rather than printed.
func TestNormalizeBadgesDropsUnknownTokens(t *testing.T) {
	badges, features := normalizeBadges([]string{"oscarwinner", "bingeready", "fanfavourite", "notathing"})
	if len(badges) != 0 {
		t.Errorf("kept undrawable tokens: %v", badges)
	}
	if len(features) != 0 {
		t.Errorf("invented features: %v", features)
	}
}

func TestParseRaisesTheFeaturesABadgeListStoodFor(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"badges":["4k","certification","netflix","trendingweek","top10","releasestatus"]}`))
	if !cfg.AgeRating {
		t.Error("certification did not switch the age rating on")
	}
	if !cfg.Providers {
		t.Error("a streaming service did not switch the provider chips on")
	}
	if !cfg.Trending {
		t.Error("trendingweek did not switch trending on")
	}
	if !cfg.TopRated {
		t.Error("top10 did not switch the top rated badge on")
	}
	if !cfg.ReleaseStatus {
		t.Error("releasestatus did not switch the release status on")
	}
	if strings.Join(cfg.Badges, ",") != "4k" {
		t.Errorf("badges = %v, want just 4k", cfg.Badges)
	}
}

// A setting the config states outright wins over one inferred from a token.
func TestAnExplicitSettingBeatsABadgeToken(t *testing.T) {
	cfg := Parse(json.RawMessage(`{"badges":["certification","netflix"],"ageRating":false,"providers":false}`))
	if cfg.AgeRating {
		t.Error("an explicit ageRating:false was overridden by a token")
	}
	if cfg.Providers {
		t.Error("an explicit providers:false was overridden by a token")
	}
}

func contains(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}
