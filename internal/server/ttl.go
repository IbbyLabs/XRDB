package server

import (
	"sort"
	"sync"
	"time"
)

// ttlStore holds the per-provider cache TTLs and lets them change at runtime.
// A render caches its result for the shortest TTL among the providers that
// contributed, so lowering a provider's TTL makes its ratings refresh sooner
// without a restart. Seeded from the startup config; the admin API mutates it.
type ttlStore struct {
	mu   sync.RWMutex
	ttls map[string]time.Duration
	// degraded caps renders that lost a badge to a failing source. Zero leaves
	// them on the normal TTL.
	degraded time.Duration
	// heldOut caps renders whose only missing badge was held back by one of our
	// own gates. Zero leaves them on the normal TTL.
	heldOut time.Duration
	// queueHeld caps renders held back by one of our request queues, which
	// clear far sooner than the daily reserve does.
	queueHeld time.Duration
	// surfaces overrides the TTL for one artwork surface. A surface with no
	// entry keeps the minimum across the rating sources that answered.
	surfaces map[string]time.Duration
}

// setSurfaces replaces the per-surface overrides.
func (s *ttlStore) setSurfaces(in map[string]time.Duration) {
	m := make(map[string]time.Duration, len(in))
	for k, v := range in {
		m[k] = v
	}
	s.mu.Lock()
	s.surfaces = m
	s.mu.Unlock()
}

// surfaceTTL returns the TTL set for one surface and whether one is set.
func (s *ttlStore) surfaceTTL(name string) (time.Duration, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.surfaces[name]
	return v, ok
}

func newTTLStore(seed map[string]time.Duration) *ttlStore {
	m := make(map[string]time.Duration, len(seed))
	for k, v := range seed {
		m[k] = v
	}
	return &ttlStore{ttls: m}
}

// get returns the TTL for a provider and whether one is set.
func (s *ttlStore) get(name string) (time.Duration, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.ttls[name]
	return v, ok
}

// snapshot returns a copy of the current TTLs, sorted-key iteration safe.
func (s *ttlStore) snapshot() map[string]time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]time.Duration, len(s.ttls))
	for k, v := range s.ttls {
		out[k] = v
	}
	return out
}

// providers returns the known provider names in sorted order.
func (s *ttlStore) providers() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]string, 0, len(s.ttls))
	for k := range s.ttls {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// degradedTTL returns the cap for renders missing a badge, or zero if unset.
func (s *ttlStore) degradedTTL() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.degraded
}

// setDegradedTTL sets the cap for renders missing a badge.
func (s *ttlStore) setDegradedTTL(d time.Duration) {
	s.mu.Lock()
	s.degraded = d
	s.mu.Unlock()
}

// heldOutTTL returns the cap for renders that lost a badge to one of our own
// gates, or zero if unset.
func (s *ttlStore) heldOutTTL() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.heldOut
}

// setHeldOutTTL sets the cap for renders that lost a badge to one of our gates.
func (s *ttlStore) setHeldOutTTL(d time.Duration) {
	s.mu.Lock()
	s.heldOut = d
	s.mu.Unlock()
}

// queueHeldTTL returns the cap for renders held back by a request queue, or
// zero if unset.
func (s *ttlStore) queueHeldTTL() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.queueHeld
}

// setQueueHeldTTL sets the cap for renders held back by a request queue.
func (s *ttlStore) setQueueHeldTTL(d time.Duration) {
	s.mu.Lock()
	s.queueHeld = d
	s.mu.Unlock()
}

// set overrides one provider's TTL live.
func (s *ttlStore) set(name string, d time.Duration) {
	s.mu.Lock()
	s.ttls[name] = d
	s.mu.Unlock()
}
