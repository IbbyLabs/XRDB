package compose

import (
	"context"
	"log/slog"
	"sync/atomic"
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

// renderTimingSampler decides which renders report their breakdown at info.
// One record per render is an access log's volume; at info that is more than a
// busy instance should carry, and at debug nobody sees it on a live one.
var renderTimingSampler atomic.Int64

// SetRenderTimingSample reports one render in n at info. Zero or one leaves the
// breakdown at debug, which is where it was.
func SetRenderTimingSample(n int) {
	if n < 0 {
		n = 0
	}
	renderTimingSampler.Store(int64(n))
}

var renderTimingCount atomic.Int64

// sampledLevel is info for the renders that fall on the sample, debug for the
// rest, so a breakdown is available on an instance nobody can turn debug on.
func sampledLevel() slog.Level {
	n := renderTimingSampler.Load()
	if n <= 1 {
		return slog.LevelDebug
	}
	if renderTimingCount.Add(1)%n == 0 {
		return slog.LevelInfo
	}
	return slog.LevelDebug
}

// log emits the breakdown as one record: phases are only meaningful together.
func (t *renderTimings) log(ctx context.Context, logger *slog.Logger, req Request) {
	level := sampledLevel()
	if !logger.Enabled(ctx, level) {
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
	logger.Log(ctx, level, "Composed a render", attrs...)
}
