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

// A credential that does not match its provider is rejected where the person
// can still fix it, rather than being routed on a guess and failing silently on
// every later render.
func TestValidateKey(t *testing.T) {
	tmdbV3 := "0123456789abcdef0123456789abcdef"
	tmdbV4 := "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2ln"
	cases := []struct {
		name, key string
		ok        bool
	}{
		{KeyTMDB, tmdbV3, true},
		{KeyTMDB, tmdbV4, true},
		{KeyTMDB, "", true}, // clearing is always allowed
		// The case this exists for: an MDBList key pasted into the TMDB field
		// used to be filed as a v3 key and 401 on every render.
		{KeyTMDB, "mdblist-key-value", false},
		{KeyTMDB, "eyJ-not-a-jwt", false},
		{KeyTMDB, "0123456789abcdef", false}, // right alphabet, wrong length
		{KeyMDBList, "mdblist-key-value", true},
		{KeyOMDB, "abcd1234", true},
		{KeyFanart, "0123456789abcdef0123456789abcdef", true},
		{KeyTrakt, "short", false},
		{KeySIMKL, "has spaces in it", false},
		{"notaprovider", "x", false},
	}
	for _, tc := range cases {
		err := ValidateKey(tc.name, tc.key)
		if tc.ok && err != nil {
			t.Errorf("ValidateKey(%s, %q) = %v, want accepted", tc.name, tc.key, err)
		}
		if !tc.ok && err == nil {
			t.Errorf("ValidateKey(%s, %q) accepted, want rejected", tc.name, tc.key)
		}
	}
}

// The routing and the validation must agree on what a read token is, or a
// credential accepted at save could still be filed into the wrong slot.
func TestReadTokenDetectionMatchesValidation(t *testing.T) {
	p := NewTMDB("", "")
	for _, key := range []string{
		"eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2ln",
		"0123456789abcdef0123456789abcdef",
	} {
		if err := ValidateKey(KeyTMDB, key); err != nil {
			t.Fatalf("fixture rejected: %v", err)
		}
		apiKey, readToken := p.credentials(WithKeys(context.Background(), map[string]string{KeyTMDB: key}))
		if IsTMDBReadToken(key) {
			if readToken != key || apiKey != "" {
				t.Errorf("read token routed to apiKey=%q readToken=%q", apiKey, readToken)
			}
		} else if apiKey != key || readToken != "" {
			t.Errorf("v3 key routed to apiKey=%q readToken=%q", apiKey, readToken)
		}
	}
}
