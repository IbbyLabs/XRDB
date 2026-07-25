package profile

import (
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func storeWithKey(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "p.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if err := s.SetEncryptionKey(strings.Repeat("a1", 32)); err != nil {
		t.Fatal(err)
	}
	return s, path
}

// The point of encrypting is that a copy of the database file is not a copy of
// the keys, so the stored bytes must not contain the value.
func TestProviderKeysAreNotReadableInTheDatabase(t *testing.T) {
	s, path := storeWithKey(t)
	p := &Profile{ID: "sealed", Type: "poster", ProviderKeys: map[string]string{"tmdb": "super-secret-value"}}
	if err := s.Save(p); err != nil {
		t.Fatal(err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	var stored string
	if err := db.QueryRow(`SELECT provider_keys FROM profiles WHERE id = ?`, "sealed").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored, "super-secret-value") {
		t.Errorf("the key is readable in the database: %q", stored)
	}
	if strings.Contains(stored, "tmdb") {
		t.Errorf("the stored value names the provider in the clear: %q", stored)
	}
	if stored == "" {
		t.Fatal("nothing was stored")
	}

	// It still round-trips for the server that holds the key.
	got, err := s.Get("sealed")
	if err != nil {
		t.Fatal(err)
	}
	if got.ProviderKeys["tmdb"] != "super-secret-value" {
		t.Errorf("round-trip gave %q", got.ProviderKeys["tmdb"])
	}
}

// Without a key the store refuses rather than writing the value in the clear.
func TestStoringAKeyWithoutAnEncryptionKeyIsRefused(t *testing.T) {
	s, _ := storeWithKey(t)
	if err := s.SetEncryptionKey(""); err != nil {
		t.Fatal(err)
	}
	if s.CanStoreSecrets() {
		t.Fatal("store reports it can hold secrets with no key")
	}
	err := s.Save(&Profile{ID: "nokey", Type: "poster", ProviderKeys: map[string]string{"tmdb": "v"}})
	if !errors.Is(err, ErrNoEncryptionKey) {
		t.Errorf("Save error = %v, want ErrNoEncryptionKey", err)
	}
	// A profile with no credentials still saves fine.
	if err := s.Save(&Profile{ID: "plain", Type: "poster"}); err != nil {
		t.Errorf("a profile with no keys failed to save: %v", err)
	}
}

// A rotated or missing key must degrade to "no credentials", not break the
// whole profile: the owner can re-enter a key, but nothing recovers a config.
func TestAnUnreadableSecretDegradesToNoKeys(t *testing.T) {
	s, path := storeWithKey(t)
	if err := s.Save(&Profile{ID: "rot", Type: "poster",
		Config:       []byte(`{"size":"large"}`),
		ProviderKeys: map[string]string{"tmdb": "v"}}); err != nil {
		t.Fatal(err)
	}
	other, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = other.Close() }()
	if err := other.SetEncryptionKey(strings.Repeat("b2", 32)); err != nil {
		t.Fatal(err)
	}
	got, err := other.Get("rot")
	if err != nil {
		t.Fatalf("a wrong key broke the whole profile: %v", err)
	}
	if len(got.ProviderKeys) != 0 {
		t.Errorf("a wrong key still produced credentials: %v", got.KeysSet)
	}
	if string(got.Config) != `{"size":"large"}` {
		t.Errorf("config did not survive: %s", got.Config)
	}
}

func TestSetEncryptionKeyAcceptsHexAndRaw(t *testing.T) {
	s, _ := storeWithKey(t)
	if err := s.SetEncryptionKey(strings.Repeat("a1", 32)); err != nil {
		t.Errorf("64 hex chars rejected: %v", err)
	}
	if err := s.SetEncryptionKey(strings.Repeat("k", 32)); err != nil {
		t.Errorf("32 raw bytes rejected: %v", err)
	}
	if err := s.SetEncryptionKey("too-short"); err == nil {
		t.Error("a short key was accepted")
	}
}
