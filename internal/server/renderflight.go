package server

import (
	"sync"
	"time"
)

// renderFlight collapses concurrent requests for one cache key onto a single
// render.
//
// Nothing is stored until a render finishes, so simultaneous requests for the
// same uncached image all miss the cache, all take a queue slot, and all
// produce the same bytes. A catalogue sweep asks for many images at once and
// pays that multiplier on every one of them.
//
// The waiter serves the leader's result rather than repeating it. A leader that
// fails or is abandoned releases its waiters to render for themselves, so a
// failure is never shared and the next arrival becomes the leader.
type renderFlight struct {
	mu       sync.Mutex
	inflight map[string]*renderCall
}

// renderCall is one in-flight render and whatever the leader produced. Every
// field is written by the leader before done is closed and read only after, so
// a waiter needs no lock of its own.
type renderCall struct {
	done chan struct{}

	served          bool
	bytes           []byte
	contentType     string
	placeholder     bool
	degraded        bool
	degradedByUs    bool
	degradedSources []string
	expiresAt       time.Time
}

func newRenderFlight() *renderFlight {
	return &renderFlight{inflight: make(map[string]*renderCall)}
}

// begin returns the call for a key and whether the caller leads it. A leader
// must call finish exactly once; a waiter must not touch the call until done
// is closed.
func (f *renderFlight) begin(key string) (*renderCall, bool) {
	if f == nil {
		return nil, true
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if call, ok := f.inflight[key]; ok {
		return call, false
	}
	call := &renderCall{done: make(chan struct{})}
	f.inflight[key] = call
	return call, true
}

// finish publishes the leader's result and releases its waiters. Deferred by
// the leader so a panic or an early return still frees them rather than
// leaving them waiting on a render that is no longer happening.
func (f *renderFlight) finish(key string, call *renderCall) {
	if f == nil || call == nil {
		return
	}
	f.mu.Lock()
	if f.inflight[key] == call {
		delete(f.inflight, key)
	}
	f.mu.Unlock()
	close(call.done)
}

// inFlight reports how many renders are currently shared. Test-facing.
func (f *renderFlight) inFlight() int {
	if f == nil {
		return 0
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.inflight)
}
