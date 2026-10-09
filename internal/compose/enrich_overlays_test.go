package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// Every badge TMDB alone supplies must reach a render whose artwork came from
// another source.
func TestOverlayMetaIsToppedUpFromTMDBForOtherArtworkSources(t *testing.T) {
	tmdbMeta := &provider.MediaMeta{
		Year:            2026,
		ContentRating:   "PG-13",
		Genres:          []string{"Drama"},
		WatchProviders:  []provider.WatchProvider{{ID: 8, Name: "Netflix"}},
		Stinger:         provider.StingerInfo{PostCredits: true},
		ReleaseStatus:   "cinemas",
		UpcomingRelease: provider.UpcomingRelease{Kind: "digital", Date: time.Date(2026, 11, 17, 0, 0, 0, 0, time.UTC)},
	}
	cases := []struct {
		name   string
		enable func(*imageconfig.Config)
		filled func(provider.MediaMeta) bool
	}{
		{"age rating", func(c *imageconfig.Config) { c.AgeRating = true }, func(m provider.MediaMeta) bool { return m.ContentRating != "" }},
		{"genre", func(c *imageconfig.Config) { c.Genre = true }, func(m provider.MediaMeta) bool { return len(m.Genres) > 0 }},
		{"providers", func(c *imageconfig.Config) { c.Providers = true }, func(m provider.MediaMeta) bool { return len(m.WatchProviders) > 0 }},
		{"stinger", func(c *imageconfig.Config) { c.Stinger = true }, func(m provider.MediaMeta) bool { return m.Stinger.Has() }},
		{"release status", func(c *imageconfig.Config) { c.ReleaseStatus = true }, func(m provider.MediaMeta) bool {
			return m.ReleaseStatus == "cinemas" && m.UpcomingRelease.Kind == "digital"
		}},
		{"info line", func(c *imageconfig.Config) { c.MetaLine = true; c.MetaLineAgeRating = true }, func(m provider.MediaMeta) bool {
			return m.Year == 2026 && len(m.Genres) > 0 && m.ContentRating != ""
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := &Pipeline{providers: testRegistry(&provider.StubProvider{ProviderName: "tmdb", Meta: tmdbMeta})}
			cfg := imageconfig.Default()
			cfg.ArtworkSource = "fanart"
			tc.enable(&cfg)
			meta := &provider.MediaMeta{PosterURL: "https://example.invalid/fanart.png"}
			p.enrichMetaForOverlays(context.Background(), Request{ContentType: "movie", MediaID: "tt33764258", Config: cfg}, meta)
			if !tc.filled(*meta) {
				t.Errorf("%s was not filled from TMDB when the artwork came from fanart", tc.name)
			}
		})
	}
}
