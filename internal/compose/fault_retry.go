package compose

import (
	"context"
	"errors"
	"sync"
	"time"

	"xrdb_rewrite/internal/provider"
)

// faultRetry collects, across one render's sources, when each source that
// failed the render is expected to answer again.
type faultRetry struct {
	mu      sync.Mutex
	longest time.Duration
	unknown bool
}

type faultRetryKey struct{}

func withFaultRetry(ctx context.Context) (context.Context, *faultRetry) {
	fr := &faultRetry{}
	return context.WithValue(ctx, faultRetryKey{}, fr), fr
}

func faultRetryFrom(ctx context.Context) *faultRetry {
	fr, _ := ctx.Value(faultRetryKey{}).(*faultRetry)
	return fr
}

// note records one source fault; a zero wait means nothing says when it ends.
func (fr *faultRetry) note(wait time.Duration) {
	if fr == nil {
		return
	}
	fr.mu.Lock()
	defer fr.mu.Unlock()
	if wait <= 0 {
		fr.unknown = true
		return
	}
	if wait > fr.longest {
		fr.longest = wait
	}
}

// after is the wait until every faulted source should answer, or zero if any
// fault has no known end.
func (fr *faultRetry) after() time.Duration {
	if fr == nil {
		return 0
	}
	fr.mu.Lock()
	defer fr.mu.Unlock()
	if fr.unknown {
		return 0
	}
	return fr.longest
}

// faultWait is how long a source that failed with err is expected to stay
// unavailable, or zero when that is not known.
func (p *Pipeline) faultWait(ctx context.Context, source, gate string, err error) time.Duration {
	if gate == provider.GateCooldown {
		return p.health.CooldownRemaining(source, provider.CallerClassFrom(ctx))
	}
	var rl *provider.RateLimitError
	if errors.As(err, &rl) && !rl.QuotaExhausted {
		return rl.RetryAfter
	}
	return 0
}
