package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/provider"
)

// A provider exposing HasCredentials gates on it; one without the method (a
// keyless public source) is always ready.
func TestProviderReady(t *testing.T) {
	keyed := provider.NewMDBList("")
	if providerReady(keyed) {
		t.Error("a keyed provider with no key should not be ready")
	}
	keyed.UpdateCredentials("k")
	if !providerReady(keyed) {
		t.Error("a keyed provider with a key should be ready")
	}
	if !providerReady(keylessStub{}) {
		t.Error("a provider without HasCredentials should always be ready")
	}
}

type keylessStub struct{}

func (keylessStub) Name() string { return "keyless" }
func (keylessStub) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return nil, nil
}
