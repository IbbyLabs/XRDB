package compose

import (
	"context"
	"log/slog"
	"math/rand/v2"
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

// recordOverlapped names a phase that ran alongside an earlier one, so its
// duration is measured rather than taken from the cursor. Phases stop summing to
// the total once one is used.
func (t *renderTimings) recordOverlapped(phase string, d time.Duration) {
	t.phases = append(t.phases, slog.Int64(phase+"_ms", d.Milliseconds()))
	t.last = time.Now()
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

// sampledLevel is info for the renders that fall on the sample, debug for the
// rest, so a breakdown is available on an instance nobody can turn debug on.
//
// Drawn at random rather than every nth. Part of what a breakdown measures is
// how many renders were already in front of this one, so a fixed stride can sit
// at the same position in every burst and report that position as the norm.
func sampledLevel() slog.Level {
	n := renderTimingSampler.Load()
	if n <= 1 {
		return slog.LevelDebug
	}
	if rand.IntN(int(n)) == 0 {
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
	attrs := make([]any, 0, len(t.phases)+6)
	attrs = append(attrs,
		"id", logging.RequestID(ctx),
		"media_type", req.MediaType,
		"media_id", req.MediaID,
		// Not derivable from the other fields.
		"size", string(req.Config.Size),
		"total_ms", time.Since(t.start).Milliseconds(),
		// Which class of caller this render served. The refusal lines already
		// carry it; without it here the only requests that can be classified
		// are the ones that were turned away.
		"caller_class", provider.CallerClassFrom(ctx).String(),
	)
	for _, a := range t.phases {
		attrs = append(attrs, a)
	}
	logger.Log(ctx, level, "Composed a render", attrs...)
}
