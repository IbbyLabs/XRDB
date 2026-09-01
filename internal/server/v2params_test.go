package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func TestV2ParametersAreAppliedToTheConfig(t *testing.T) {
	cfg := imageconfig.Default()
	raw := "imageText=clean&posterRatings=imdb%2Ctomatoes&posterRatingsLayout=bottom" +
		"&ratingStyle=glass"

	applied := applyV2QueryParams(&cfg, raw, "poster")

	for _, want := range []string{"imageText", "ratingStyle", "posterRatings", "posterRatingsLayout"} {
		if !slices.Contains(applied, want) {
			t.Errorf("%s was not applied: got %v", want, applied)
		}
	}
	if cfg.TextPreference != imageconfig.TextClean {
		t.Errorf("textPreference: got %q", cfg.TextPreference)
	}
	// v2's tomatoes is XRDB's rt. The rename living in the migration package is
	// the reason this reads the converter rather than the query string.
	if !slices.Contains(cfg.Ratings, "rt") {
		t.Errorf("the v2 source id was not translated: got %v", cfg.Ratings)
	}
	if !slices.Contains(cfg.Ratings, "imdb") {
		t.Errorf("a shared source id was lost: got %v", cfg.Ratings)
	}
}

// v2's streamBadges gated a torrent-index lookup XRDB does unconditionally, so
// it has nothing to set here. It is not the streaming-provider chips, which is
// what the name suggests and what an earlier attempt mapped it to.
func TestStreamBadgesIsNotAliased(t *testing.T) {
	for _, mode := range []string{"on", "auto", "off"} {
		cfg := imageconfig.Default()
		cfg.Providers = true

		if applied := applyV2QueryParams(&cfg, "posterStreamBadges="+mode, "poster"); applied != nil {
			t.Errorf("%q was applied: %v", mode, applied)
		}
		if !cfg.Providers {
			t.Errorf("%q moved the streaming-provider chips", mode)
		}
	}
}

func TestAParameterNobodySentIsNotApplied(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"trakt"}
	cfg.TextPreference = imageconfig.TextTextless

	applied := applyV2QueryParams(&cfg, "imageText=clean", "poster")

	if len(applied) != 1 || applied[0] != "imageText" {
		t.Fatalf("applied the wrong set: %v", applied)
	}
	if !slices.Equal(cfg.Ratings, []string{"trakt"}) {
		t.Errorf("a URL naming one setting moved another: got %v", cfg.Ratings)
	}
}

func TestARenderWithNoV2ParametersIsUntouched(t *testing.T) {
	cfg := imageconfig.Default()
	before := cfg

	if applied := applyV2QueryParams(&cfg, "config=default&cb=1", "poster"); applied != nil {
		t.Fatalf("applied something from a URL carrying no v2 parameter: %v", applied)
	}
	if cfg.TextPreference != before.TextPreference || cfg.BadgeStyle != before.BadgeStyle {
		t.Error("the config moved without a v2 parameter")
	}
}

// fakeTMDBKey builds a value of the shape TMDB issues. Built rather than
// written, because a 32-character hex literal is what a secret scanner looks
// for and this file would fail the scan on a string that is not a credential.
func fakeTMDBKey() string { return strings.Repeat("ab", 16) }

// A render never fails on a bad parameter, so a rejected key is only visible in
// the header and the log. The accepted case sits beside it so the test cannot
// pass on a handler that sets the header unconditionally.
func TestARejectedTMDBKeyIsAnnouncedInAHeader(t *testing.T) {
	for _, tc := range []struct {
		name string
		key  string
		want string
	}{
		{name: "not a credential", key: "hunter2", want: "ignored"},
		{name: "right length wrong alphabet", key: "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", want: "ignored"},
		{name: "v3 api key", key: fakeTMDBKey(), want: ""},
		{name: "absent", key: "", want: ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := NewHandler("test", nil, nil, nil, nil, config.Config{})
			url := "/poster/tt0816692"
			if tc.key != "" {
				url += "?tmdbKey=" + tc.key
			}
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, url, nil))

			if got := rr.Header().Get("X-Render-Tmdb-Key"); got != tc.want {
				t.Errorf("X-Render-Tmdb-Key = %q, want %q (status %d)", got, tc.want, rr.Code)
			}
		})
	}
}

// The map a render carries may be a stored profile's own, so adding a URL key
// to it would hand that key to every later render of that profile.
func TestKeysFromCopies(t *testing.T) {
	stored := map[string]string{provider.KeyMediux: "m"}
	ctx := provider.WithKeys(context.Background(), stored)

	got := provider.KeysFrom(ctx)
	got[provider.KeyTMDB] = fakeTMDBKey()

	if _, leaked := stored[provider.KeyTMDB]; leaked {
		t.Error("a URL key was written into the stored profile's map")
	}
}
