package server

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/provider"
)

func TestARecognisedSweepRenderIsNotStored(t *testing.T) {
	for _, tc := range []struct {
		name   string
		ua     string
		stored bool
	}{
		{"a recognised sweep", "AIOMetadata/3.4.1", false},
		{"no agent at all", "", true},
		{"an ordinary client", "Stremio/4.4.142 okhttp/4.9.2", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reg := provider.NewRegistry()
			reg.Register(&provider.StubProvider{
				ProviderName: "tmdb",
				Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
			})
			reg.Register(&provider.StubProvider{
				ProviderName: "imdb",
				Meta:         &provider.MediaMeta{Ratings: []provider.Rating{{Source: "imdb", Value: 8, Label: "8.0"}}},
			})
			pipeline := compose.NewWithFetcher(reg, fixedFetcher{data: testSourcePNG(t, 1000, 1500)})
			pipeline.SetRatingsCacheTTL(time.Hour)
			c, err := cache.New(filepath.Join(t.TempDir(), "cache"), time.Hour, 100, 8<<20)
			if err != nil {
				t.Fatalf("cache.New: %v", err)
			}
			t.Cleanup(c.Close)
			h := NewHandler("test", nil, nil, pipeline, c, config.Config{})

			req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil)
			req.Header.Set("User-Agent", tc.ua)
			if tc.ua == "" {
				req.Header.Del("User-Agent")
			}
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d", rr.Code)
			}

			if got := c.Stats().DiskEntries > 0; got != tc.stored {
				t.Errorf("render stored = %v, want %v", got, tc.stored)
			}
			if pipeline.CachedRatings() == 0 {
				t.Error("the ratings cache was not written")
			}
		})
	}
}
