package server

import (
	"context"
	"time"

	"golang.org/x/sync/semaphore"

	"xrdb_rewrite/internal/imageconfig"
)

// concurrencyLimiter bounds how many renders run at once. A catalogue view
// fires a burst of artwork requests; without a cap each one spawns a full image
// fetch/decode/composite concurrently and memory scales with the burst size,
// which is what drives the out-of-memory crashes. A nil limiter is unbounded.
// Renders are weighted because they are not the same size of job: a 4K poster
// is nine times the pixels of a normal one and roughly seven times the work, so
// counting it as one render lets a handful of them take the whole budget and
// starve everything behind them.
type concurrencyLimiter struct {
	sem      *semaphore.Weighted
	capacity int64
}

// bulkPollInterval is how often a bulk caller re-checks for a free slot.
const bulkPollInterval = 50 * time.Millisecond

// weightUnit is how many budget units a normal poster costs. Weights are
// integers, so pricing the smallest surface at 1 and scaling everything else
// from it needs the unit above 1 to express the difference at all.
const weightUnit = 4

// renderWeight is what a render costs against the budget. Both the surface and
// the size decide it: the canonical outputs in render/output.go differ by an
// order of magnitude between a thumbnail at 320x180 and a poster at 780x1170,
// and size multiplies the dimensions on top of that.
//
// The figures track delivered area with a floor rather than equalling it. Most
// of a render is fetch, decode and compose, and the downsample is last, so a
// thumbnail is cheaper than a poster but not by the sixteen-fold its pixel
// count suggests.
//
// It is a pure function of (mediaType, size), and both are part of the render
// cache key — size at imageconfig.CacheKey, media type at render.CacheKey — so
// two requests that share a key always cost the same. Nothing per-caller
// belongs here.
func renderWeight(mediaType string, size imageconfig.MediaSize) int64 {
	switch mediaType {
	case "thumbnail":
		switch size {
		case imageconfig.Size4K:
			return 2
		default:
			return 1
		}
	case "logo":
		switch size {
		case imageconfig.Size4K:
			return 6
		case imageconfig.SizeLarge:
			return 2
		default:
			return 1
		}
	default: // poster, backdrop, and anything this does not recognise
		switch size {
		case imageconfig.Size4K:
			return 36
		case imageconfig.SizeLarge:
			return 9
		default:
			return weightUnit
		}
	}
}

// newConcurrencyLimiter returns a limiter with a budget of n units, or nil
// (unbounded) when n <= 0.
func newConcurrencyLimiter(n int) *concurrencyLimiter {
	if n <= 0 {
		return nil
	}
	return &concurrencyLimiter{sem: semaphore.NewWeighted(int64(n)), capacity: int64(n)}
}

// acquire blocks until a slot is free. It returns false only when ctx is done
// before a slot is obtained, in which case the caller must abort and must not
// call release. A nil limiter is unbounded and always returns true.
func (l *concurrencyLimiter) weight(w int64) int64 {
	if w > l.capacity {
		return l.capacity
	}
	if w < 1 {
		return 1
	}
	return w
}

func (l *concurrencyLimiter) acquire(ctx context.Context, w int64) bool {
	if l == nil {
		return true
	}
	return l.sem.Acquire(ctx, l.weight(w)) == nil
}

// acquireWithin is acquire with a deadline. It returns false once wait elapses,
// so a burst that outruns the render throughput is turned away quickly instead
// of queueing without bound: waiting three minutes for a poster is worse for the
// caller than being told to come back, and the queue itself is what turns a
// short burst into minutes of latency for everyone behind it.
func (l *concurrencyLimiter) acquireWithin(ctx context.Context, wait time.Duration, w int64) bool {
	if l == nil {
		return true
	}
	if wait <= 0 {
		return l.acquire(ctx, w)
	}
	waitCtx, cancel := context.WithTimeout(ctx, wait)
	defer cancel()
	return l.sem.Acquire(waitCtx, l.weight(w)) == nil
}

// acquireBulk takes a slot for a caller sweeping the catalogue. It waits far
// longer than an interactive request would, and it stands aside whenever one is
// queued: a sweep has nobody watching it, so making it wait costs less than
// turning away a request someone is looking at.
//
// Standing aside is TryAcquire's own rule: it declines while anything is queued,
// and only interactive callers ever queue here. Polling it rather than joining
// that queue is what keeps a sweep out of the way, because the queue is
// first-in-first-out and a heavy bulk render at its head holds up every lighter
// request behind it.
func (l *concurrencyLimiter) acquireBulk(ctx context.Context, wait time.Duration, w int64) bool {
	if l == nil {
		return true
	}
	weight := l.weight(w)
	if wait <= 0 {
		return l.acquire(ctx, w)
	}
	waitCtx, cancel := context.WithTimeout(ctx, wait)
	defer cancel()

	ticker := time.NewTicker(bulkPollInterval)
	defer ticker.Stop()
	for {
		if l.sem.TryAcquire(weight) {
			return true
		}
		select {
		case <-waitCtx.Done():
			return false
		case <-ticker.C:
		}
	}
}

// release frees a slot previously taken by a successful acquire. It is a no-op
// on a nil limiter.
func (l *concurrencyLimiter) release(w int64) {
	if l == nil {
		return
	}
	l.sem.Release(l.weight(w))
}
