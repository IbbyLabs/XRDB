package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/warm"
)

// warmCatalogues renders one pass of every configured surface into the cache.
// Returns how many titles were submitted per surface, which is what the caller
// logs and what the tests assert on.
func warmCatalogues(
	ctx context.Context,
	cw config.CacheWarm,
	client *warm.Client,
	pipeline *compose.Pipeline,
	renderCache *cache.Cache,
	ttls *ttlStore,
	logger *slog.Logger,
	run warmRun,
) map[string]int {
	submitted := make(map[string]int)
	for surface, url := range cw.Surfaces() {
		titles, err := client.Titles(ctx, url, cw.MaxItems)
		if err != nil {
			logger.WarnContext(ctx, "Could not read a catalogue for cache warming",
				"surface", surface, "error", err)
			continue
		}
		if len(titles) == 0 {
			continue
		}
		var paths, ids []string
		for _, t := range titles {
			if p, ok := warmRenderPath(t.Art(surface), surface); ok && run.dispatch != nil {
				paths = append(paths, p)
			} else {
				ids = append(ids, t.ID)
			}
		}
		submitted[surface] = len(titles)
		logger.InfoContext(ctx, "Warming a catalogue into the render cache",
			"surface", surface, "titles", len(titles), "by_url", len(paths), "by_id", len(ids))
		if pipeline == nil || renderCache == nil {
			continue
		}
		if len(paths) > 0 {
			served, failed := warmByURL(ctx, run.dispatch, run.apiKey, paths)
			logger.InfoContext(ctx, "Warmed a catalogue's artwork URLs",
				"surface", surface, "served", served, "failed", failed)
		}
		if len(ids) == 0 {
			continue
		}
		target, err := run.resolve(surface)
		if err != nil {
			logger.WarnContext(ctx, "Could not resolve the cache warming profile, so this surface is not warmed",
				"surface", surface, "profile", cw.Profile, "error", err)
			continue
		}
		warmPosters(pipeline, renderCache, ids, surface, target, ttls)
	}
	return submitted
}

// StartCacheWarmSchedule pre-renders the catalogues an addon lists, at startup
// and then on an interval, so a browsed catalogue is served from cache instead
// of rendered on first sight. Disabled unless configured.
func StartCacheWarmSchedule(
	ctx context.Context,
	cfg config.Config,
	store *profile.Store,
	dispatch http.Handler,
	pipeline *compose.Pipeline,
	renderCache *cache.Cache,
	logger *slog.Logger,
) {
	cw := cfg.CacheWarm
	if logger == nil {
		logger = slog.Default()
	}
	// Said rather than returned in silence. A feature that never runs because a
	// setting is missing reads exactly like one that is working quietly, which
	// is how the status panel shipped switched off for six hours.
	//
	// The nil guards below are not reported: main builds both unconditionally
	// and exits if either fails, so a line naming them could never fire.
	if !cw.Enabled || len(cw.Surfaces()) == 0 {
		reason := "it is not enabled"
		if cw.Enabled {
			reason = "no surfaces are selected"
		}
		logger.InfoContext(ctx, "Cache warming is off", "reason", reason)
		return
	}
	if pipeline == nil || renderCache == nil {
		return
	}
	client := &warm.Client{HTTP: &http.Client{Timeout: 30 * time.Second}}
	// Seeded from the startup config rather than shared with the request
	// handler, so a warmed entry uses the configured TTLs. A TTL changed
	// through the admin API applies from the next warm run.
	ttls := newTTLStore(cfg.ProviderTTLs)
	ttls.setSurfaces(cfg.SurfaceTTLs)
	run := warmRun{dispatch: dispatch, apiKey: cfg.APIKey, resolve: func(surface string) (warmTarget, error) {
		return resolveWarmTarget(store, cfg.DefaultProfile, cw.Profile, surface)
	}}

	go func() {
		logger.InfoContext(ctx, "Cache warming is on",
			"surfaces", len(cw.Surfaces()), "max_items", cw.MaxItems,
			"interval_hours", cw.Interval.Hours(), "profile", cw.Profile)
		warmCatalogues(ctx, cw, client, pipeline, renderCache, ttls, logger, run)

		ticker := time.NewTicker(cw.Interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				warmCatalogues(ctx, cw, client, pipeline, renderCache, ttls, logger, run)
			}
		}
	}()
}
