package compose

import (
	"sync"
	"time"
)

// streamBreakerThreshold is how many consecutive failures close the addon off,
// and streamBreakerCooldown is how long it stays shut before one request is let
// through to test it.
const (
	streamBreakerThreshold = 5
	streamBreakerCooldown  = 60 * time.Second
)

// streamBreaker stops asking a stream addon that is not answering.
//
// A render that cannot verify its quality badges draws them as picked. That is
// the same answer a timeout produces, so once the addon has failed repeatedly
// every further wait buys nothing and costs the render its whole timeout while
// holding a render slot. One catalogue crawl paid that 177 times in four
// minutes.
type streamBreaker struct {
	mu        sync.Mutex
	fails     int
	openUntil time.Time
}

// shut reports whether to skip the addon entirely. The first call after the
// cooldown lapses returns false, so one request probes whether it has recovered.
func (b *streamBreaker) shut() bool {
	if b == nil {
		return false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.openUntil.IsZero() || time.Now().After(b.openUntil) {
		return false
	}
	return true
}

func (b *streamBreaker) failed() {
	if b == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.fails++
	if b.fails >= streamBreakerThreshold {
		b.openUntil = time.Now().Add(streamBreakerCooldown)
		b.fails = 0
	}
}

func (b *streamBreaker) answered() {
	if b == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.fails = 0
	b.openUntil = time.Time{}
}
