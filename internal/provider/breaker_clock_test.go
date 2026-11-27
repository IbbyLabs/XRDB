package provider

import (
	"sync"
	"time"
)

// breakerClock is a settable clock for a HealthTracker.
type breakerClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *breakerClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *breakerClock) advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

// newClockedHealth returns a tracker on a clock the test advances by hand.
func newClockedHealth() (*HealthTracker, *breakerClock) {
	c := &breakerClock{t: time.Date(2026, 11, 27, 0, 0, 0, 0, time.UTC)}
	h := NewHealthTracker(16, time.Hour)
	h.now = c.now
	return h, c
}

// failAcrossSpan records n failures spread so the streak outlasts the span.
func failAcrossSpan(h *HealthTracker, c *breakerClock, source string, err error, class CallerClass, n int) {
	for i := 0; i < n; i++ {
		if i > 0 {
			c.advance(failureBreakerSpan)
		}
		h.Failure(source, err, class)
	}
}
