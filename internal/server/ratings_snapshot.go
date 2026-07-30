package server

import (
	"context"
	"log/slog"
	"time"

	"xrdb_rewrite/internal/compose"
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
	go func() {
		ticker := time.NewTicker(ratingsSnapshotInterval)
		defer ticker.Stop()
		save := func(why string) {
			if err := pipeline.SaveRatingsCache(); err != nil {
				logger.Warn("Could not write the remembered ratings", "when", why, "error", err)
			}
		}
		for {
			select {
			case <-ctx.Done():
				save("shutdown")
				return
			case <-ticker.C:
				save("timer")
			}
		}
	}()
}
