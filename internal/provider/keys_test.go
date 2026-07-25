package provider

import (
	"context"
	"testing"
)

// The owner's credential stands in for the server's; without one the server's
// is used, so a profile that supplies nothing keeps working.
func TestKeyFromPrefersTheOwnersCredential(t *testing.T) {
	ctx := WithKeys(context.Background(), map[string]string{KeyTMDB: "owner-key"})
	if got := keyFrom(ctx, KeyTMDB); got != "owner-key" {
		t.Errorf("keyFrom = %q, want owner-key", got)
	}
	if got := keyFrom(ctx, KeyMDBList); got != "" {
		t.Errorf("an unset provider returned %q, want the server's", got)
	}
	if got := keyFrom(context.Background(), KeyTMDB); got != "" {
		t.Errorf("a context with no keys returned %q", got)
	}
	if got := keyFrom(nil, KeyTMDB); got != "" { //nolint:staticcheck // nil is a real caller state
		t.Errorf("a nil context returned %q", got)
	}
}

// A stored map must not accumulate providers that read nothing, or blanks.
func TestFilterSupported(t *testing.T) {
	got := FilterSupported(map[string]string{
		"TMDB": " owner-key ", "mdblist": "", "notaprovider": "x", "fanart": "f",
	})
	if len(got) != 2 || got[KeyTMDB] != "owner-key" || got[KeyFanart] != "f" {
		t.Errorf("FilterSupported = %v, want tmdb and fanart only", got)
	}
	if FilterSupported(nil) != nil || FilterSupported(map[string]string{"tmdb": " "}) != nil {
		t.Error("an empty result should be nil, not an empty map")
	}
}

// TMDB issues two credential kinds and they go to different slots.
func TestTMDBReadsBothCredentialKinds(t *testing.T) {
	p := NewTMDB("server-key", "server-token")

	jwt := "eyJhbGciOiJIUzI1NiJ9.body.sig"
	if k, tok := p.credentials(WithKeys(context.Background(), map[string]string{KeyTMDB: jwt})); k != "" || tok != jwt {
		t.Errorf("a read token went to apiKey=%q readToken=%q", k, tok)
	}
	if k, tok := p.credentials(WithKeys(context.Background(), map[string]string{KeyTMDB: "abc123"})); k != "abc123" || tok != "" {
		t.Errorf("a v3 key went to apiKey=%q readToken=%q", k, tok)
	}
	// No owner credential: the server's, both slots intact.
	if k, tok := p.credentials(context.Background()); k != "server-key" || tok != "server-token" {
		t.Errorf("fallback gave apiKey=%q readToken=%q", k, tok)
	}
}
