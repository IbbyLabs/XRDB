package provider

import "testing"

// Every keyed provider must report no credentials until one is set, and pick up
// a credential set at runtime — this is what lets a key saved in the UI activate
// the provider without a restart.
func TestKeyedProvidersUpdateCredentialsLive(t *testing.T) {
	type keyed interface {
		HasCredentials() bool
		UpdateCredentials(string)
	}
	cases := map[string]keyed{
		"mdblist": NewMDBList(""),
		"omdb":    NewOMDB(""),
		"fanart":  NewFanart(""),
		"trakt":   NewTrakt(""),
		"simkl":   NewSIMKL(""),
	}
	for name, p := range cases {
		if p.HasCredentials() {
			t.Errorf("%s: reports credentials before any key is set", name)
		}
		p.UpdateCredentials("a-key")
		if !p.HasCredentials() {
			t.Errorf("%s: does not report credentials after UpdateCredentials", name)
		}
		p.UpdateCredentials("")
		if p.HasCredentials() {
			t.Errorf("%s: still reports credentials after the key is cleared", name)
		}
	}
}

// TMDB carries two credentials and is satisfied by either.
func TestTMDBHasCredentialsWithEitherToken(t *testing.T) {
	tm := NewTMDB("", "")
	if tm.HasCredentials() {
		t.Error("TMDB reports credentials with neither key nor token")
	}
	tm.UpdateCredentials("apikey", "")
	if !tm.HasCredentials() {
		t.Error("TMDB should be satisfied by an api key alone")
	}
	tm.UpdateCredentials("", "readtoken")
	if !tm.HasCredentials() {
		t.Error("TMDB should be satisfied by a read token alone")
	}
	tm.UpdateCredentials("", "")
	if tm.HasCredentials() {
		t.Error("TMDB should report no credentials once both are cleared")
	}
}
