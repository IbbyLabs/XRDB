package provider

import (
	"context"
	"sync"
	"sync/atomic"
)

// StubProvider is a test double for Provider.
type StubProvider struct {
	ProviderName string
	Meta         *MediaMeta
	Err          error
	Calls        int32 // incremented atomically on each Fetch call
	// sawKey records the owner-supplied credential the last Fetch was given, so
	// a test can assert the profile's key reached the provider. Guarded: the
	// pipeline fetches providers concurrently.
	mu     sync.Mutex
	sawKey string
}

// SawKey returns the owner-supplied credential the last Fetch was given.
func (s *StubProvider) SawKey() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sawKey
}

// SetSawKey resets the recorded credential between assertions.
func (s *StubProvider) SetSawKey(v string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sawKey = v
}

func (s *StubProvider) Name() string { return s.ProviderName }
func (s *StubProvider) Fetch(ctx context.Context, _, _ string) (*MediaMeta, error) {
	atomic.AddInt32(&s.Calls, 1)
	s.SetSawKey(keyFrom(ctx, s.ProviderName))
	return s.Meta, s.Err
}
