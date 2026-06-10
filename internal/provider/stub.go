package provider

import (
	"context"
	"sync/atomic"
)

// StubProvider is a test double for Provider.
type StubProvider struct {
	ProviderName string
	Meta         *MediaMeta
	Err          error
	Calls        int32 // incremented atomically on each Fetch call
}

func (s *StubProvider) Name() string { return s.ProviderName }
func (s *StubProvider) Fetch(_ context.Context, _, _ string) (*MediaMeta, error) {
	atomic.AddInt32(&s.Calls, 1)
	return s.Meta, s.Err
}
