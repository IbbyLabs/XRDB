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

// set overrides one provider's TTL live.
func (s *ttlStore) set(name string, d time.Duration) {
	s.mu.Lock()
	s.ttls[name] = d
	s.mu.Unlock()
}
