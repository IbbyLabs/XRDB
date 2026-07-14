package server

import "context"

// concurrencyLimiter bounds how many renders run at once. A catalogue view
// fires a burst of artwork requests; without a cap each one spawns a full image
// fetch/decode/composite concurrently and memory scales with the burst size,
// which is what drives the out-of-memory crashes. A nil limiter is unbounded.
type concurrencyLimiter struct {
	slots chan struct{}
}

// newConcurrencyLimiter returns a limiter allowing n concurrent holders, or nil
// (unbounded) when n <= 0.
func newConcurrencyLimiter(n int) *concurrencyLimiter {
	if n <= 0 {
		return nil
	}
	return &concurrencyLimiter{slots: make(chan struct{}, n)}
}

// acquire blocks until a slot is free. It returns false only when ctx is done
// before a slot is obtained, in which case the caller must abort and must not
// call release. A nil limiter is unbounded and always returns true.
func (l *concurrencyLimiter) acquire(ctx context.Context) bool {
	if l == nil {
		return true
	}
	select {
	case l.slots <- struct{}{}:
		return true
	case <-ctx.Done():
		return false
	}
}

// release frees a slot previously taken by a successful acquire. It is a no-op
// on a nil limiter.
func (l *concurrencyLimiter) release() {
	if l == nil {
		return
	}
	<-l.slots
}
