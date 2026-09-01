package provider

import (
	"strings"
	"sync"
	"time"
)

// keySpentFor is how long a credential stays skipped after the service said its
// allowance was spent. The reset hour is the provider's and none of them
// publish it, so the mark decays rather than following a schedule: an hour
// costs one wasted request per key and recovers promptly once the day rolls.
const keySpentFor = time.Hour

// keyRing hands out one of several credentials for a source and moves on from
// one the service has said is spent.
//
// Rotation multiplies a daily quota and does nothing for a per-second rate, so
// it is wired only to the sources that meter by the day. A source paced by rate
// gains no headroom from a second key and would carry an inert control.
type keyRing struct {
	mu    sync.Mutex
	keys  []string
	spent map[string]time.Time
}

// newKeyRing reads several credentials from one setting, separated by commas.
// A single key is the ordinary case and produces a ring of one.
func newKeyRing(raw string) *keyRing {
	r := &keyRing{spent: map[string]time.Time{}}
	for _, part := range strings.Split(raw, ",") {
		if part = strings.TrimSpace(part); part != "" {
			r.keys = append(r.keys, part)
		}
	}
	return r
}

// current returns the credential to use now: the first that is not marked
// spent. When every key is marked the marks are cleared and the first is
// returned, so a source is never left with nothing to call.
func (r *keyRing) current() string {
	if r == nil {
		return ""
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.keys) == 0 {
		return ""
	}
	now := time.Now()
	for _, key := range r.keys {
		if at, marked := r.spent[key]; !marked || now.Sub(at) >= keySpentFor {
			delete(r.spent, key)
			return key
		}
	}
	clear(r.spent)
	return r.keys[0]
}

// markSpent records that the service refused this credential because its
// allowance is gone, so current moves to the next.
//
// Only a typed quota refusal reaches here. A refusal we cannot classify is
// retried on the same key instead: mistaking a blip for exhaustion burns every
// key in the ring and leaves nothing to fall back to, while mistaking
// exhaustion for a blip costs one retry and rotates on the next typed refusal.
// That asymmetry is the reason, not a measurement — the case is too rare on
// this instance to count.
func (r *keyRing) markSpent(key string) {
	if r == nil || key == "" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, known := r.spent[key]; !known {
		r.spent[key] = time.Now()
	}
}

// set replaces the credentials, keeping any mark that still applies to a key
// that survived the change.
func (r *keyRing) set(raw string) {
	if r == nil {
		return
	}
	next := newKeyRing(raw)
	r.mu.Lock()
	defer r.mu.Unlock()
	kept := map[string]time.Time{}
	for _, key := range next.keys {
		if at, marked := r.spent[key]; marked {
			kept[key] = at
		}
	}
	r.keys, r.spent = next.keys, kept
}

// configured reports whether the ring holds any credential.
func (r *keyRing) configured() bool {
	if r == nil {
		return false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.keys) > 0
}

// size reports how many credentials the ring holds, for the admin surface.
func (r *keyRing) size() int {
	if r == nil {
		return 0
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.keys)
}
