package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/warm"
)

// warmCatalogues renders one pass of every configured surface into the cache.
// Returns how many ids were submitted per surface, which is what the caller
// logs and what the tests assert on.
func warmCatalogues(
	ctx context.Context,
	cw config.CacheWarm,
	client *warm.Client,
	pipeline *compose.Pipeline,
	renderCache *cache.Cache,
	ttls *ttlStore,
	logger *slog.Logger,
) map[string]int {
	submitted := make(map[string]int)
	for surface, url := range cw.Surfaces() {
		ids, err := client.IDs(ctx, url, cw.MaxItems)
		if err != nil {
			logger.WarnContext(ctx, "Could not read a catalogue for cache warming",
				"surface", surface, "error", err)
			continue
		}
		if len(ids) == 0 {
			continue
		}
		submitted[surface] = len(ids)
		logger.InfoContext(ctx, "Warming a catalogue into the render cache",
			"surface", surface, "titles", len(ids))
		if pipeline == nil || renderCache == nil {
			continue
		}
		warmPosters(pipeline, renderCache, ids, surface, imageconfig.ParseSurface(nil, surface), ttls)
	}
	return submitted
}

// StartCacheWarmSchedule pre-renders the catalogues an addon lists, at startup
// and then on an interval, so a browsed catalogue is served from cache instead
// of rendered on first sight. Disabled unless configured.
func StartCacheWarmSchedule(
	ctx context.Context,
	cfg config.Config,
	pipeline *compose.Pipeline,
	renderCache *cache.Cache,
	logger *slog.Logger,
) {
	cw := cfg.CacheWarm
	if !cw.Enabled || len(cw.Surfaces()) == 0 || pipeline == nil || renderCache == nil {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	client := &warm.Client{HTTP: &http.Client{Timeout: 30 * time.Second}}
	// Seeded from the startup config rather than shared with the request
	// handler, so a warmed entry uses the configured TTLs. A TTL changed
	// through the admin API applies from the next warm run.
	ttls := newTTLStore(cfg.ProviderTTLs)

	go func() {
		logger.InfoContext(ctx, "Cache warming is on",
			"surfaces", len(cw.Surfaces()), "max_items", cw.MaxItems,
			"interval_hours", cw.Interval.Hours())
		warmCatalogues(ctx, cw, client, pipeline, renderCache, ttls, logger)

		ticker := time.NewTicker(cw.Interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				warmCatalogues(ctx, cw, client, pipeline, renderCache, ttls, logger)
			}
		}
	}()
}
