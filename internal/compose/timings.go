package compose

import (
	"context"
	"log/slog"
	"time"

	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/provider"
)

// renderTimings records how long each phase of a render took. A render that
// misses the cache spends most of its time waiting on providers, and which
// provider is the slow one is not visible from the request latency alone.
type renderTimings struct {
	start  time.Time
	last   time.Time
	phases []slog.Attr
}

func newRenderTimings() *renderTimings {
	now := time.Now()
	return &renderTimings{start: now, last: now}
}

// mark closes the phase that ended here and names it.
func (t *renderTimings) mark(phase string) {
	now := time.Now()
	t.phases = append(t.phases, slog.Int64(phase+"_ms", now.Sub(t.last).Milliseconds()))
	t.last = now
}

// ratingsOf is nil-safe so the per-source log can report a count either way.
func ratingsOf(meta *provider.MediaMeta) []provider.Rating {
	if meta == nil {
		return nil
	}
	return meta.Ratings
}

// log emits the breakdown at debug. Phases are only meaningful together, so
// they go out as one record rather than one line per phase.
func (t *renderTimings) log(ctx context.Context, logger *slog.Logger, req Request) {
	if !logger.Enabled(ctx, slog.LevelDebug) {
		return
	}
	attrs := make([]any, 0, len(t.phases)+5)
	attrs = append(attrs,
		"id", logging.RequestID(ctx),
		"media_type", req.MediaType,
		"media_id", req.MediaID,
		"total_ms", time.Since(t.start).Milliseconds(),
	)
	for _, a := range t.phases {
		attrs = append(attrs, a)
	}
	logger.DebugContext(ctx, "Composed a render", attrs...)
}
