package server

import (
	"context"
	"log/slog"
	"time"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/provider"
)

// ratingsSnapshotInterval is how often the remembered ratings are written out.
// Containers here are cycled roughly every twenty minutes, so a longer gap
// would routinely lose a whole window of metered lookups.
const ratingsSnapshotInterval = 5 * time.Minute

// StartRatingsCacheSnapshots persists the ratings cache on a timer and once
// more on shutdown. Without it a restart discards every remembered answer and
// the next render pays the upstream cost again.
func StartRatingsCacheSnapshots(ctx context.Context, pipeline *compose.Pipeline, logger *slog.Logger) {
	if pipeline == nil {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	startSnapshotLoop(ctx, logger, "the remembered ratings", pipeline.SaveRatingsCache)
}

// StartSIMKLIDCacheSnapshots persists the resolved IMDb-to-SIMKL id mappings.
// SIMKL's search endpoint is not cached upstream, so a restart that discarded
// them made the service re-search the whole catalogue.
func StartSIMKLIDCacheSnapshots(ctx context.Context, simkl *provider.SIMKL, logger *slog.Logger) {
	if logger == nil {
		logger = slog.Default()
	}
	// nil when SIMKL is not in the registry, which means it is not configured
	// rather than that something failed. Said rather than returned in silence.
	if simkl == nil {
		logger.InfoContext(ctx, "SIMKL id caching is off", "reason", "SIMKL is not configured")
		return
	}
	startSnapshotLoop(ctx, logger, "the remembered SIMKL ids", func() error {
		// Logged with the write so the saving is observable. Nothing else reports
		// how many searches the service makes.
		st := simkl.IDCacheStats()
		logger.Info("SIMKL id lookups so far",
			"ids_held", st.IDs, "misses_held", st.Misses,
			"answered_from_cache", st.Hits, "answered_as_no_match", st.NoMatch,
			"searches_sent", st.Searches)
		return simkl.SaveIDCache()
	})
}

// StartDailyBudgetSnapshots persists the per-source daily allowance counts.
//
// Deliberately its own loop rather than riding on the SIMKL one. SIMKL is the
// only metered source today, so folding it in would work and would quietly
// stop the moment a second source gained an allowance without a SIMKL provider
// being configured.
func StartDailyBudgetSnapshots(ctx context.Context, logger *slog.Logger) {
	if logger == nil {
		logger = slog.Default()
	}
	startSnapshotLoop(ctx, logger, "the daily allowance counts", provider.SaveDailyBudgets)
}

// startSnapshotLoop writes a cache out on a timer and once more on shutdown.
func startSnapshotLoop(ctx context.Context, logger *slog.Logger, what string, save func() error) {
	go func() {
		ticker := time.NewTicker(ratingsSnapshotInterval)
		defer ticker.Stop()
		write := func(why string) {
			if err := save(); err != nil {
				logger.Warn("Could not write "+what, "when", why, "error", err)
			}
		}
		for {
			select {
			case <-ctx.Done():
				write("shutdown")
				return
			case <-ticker.C:
				write("timer")
			}
		}
	}()
}
