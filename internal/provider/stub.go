package provider

import "context"

// StubProvider is a test double for Provider.
type StubProvider struct {
	ProviderName string
	Meta         *MediaMeta
	Err          error
}

func (s *StubProvider) Name() string { return s.ProviderName }
func (s *StubProvider) Fetch(_ context.Context, _, _ string) (*MediaMeta, error) {
	return s.Meta, s.Err
}
