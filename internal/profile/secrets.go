package profile

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
)

// An owner's provider API keys are recoverable secrets, unlike the bcrypt
// password hash beside them, so they are encrypted before they reach the
// database. The realistic exposure for a SQLite file is not a live attacker on
// the host — who already has the process environment — but the file being
// copied: backups, volume snapshots, a debug dump. Encrypting at rest is what
// separates "someone has the database" from "someone has the keys".
//
// The format matches the one v2 used, so the operational story is unchanged:
// [1 byte version][12 byte nonce][ciphertext with a 16 byte tag], hex encoded.

const secretVersion = 1

// ErrNoEncryptionKey reports that the server has no key configured, so a
// credential cannot be stored. Refusing is deliberate: writing it in the clear
// instead would quietly defeat the reason for encrypting it.
var ErrNoEncryptionKey = errors.New("no encryption key configured, so provider credentials cannot be stored")

// SetEncryptionKey installs the key used for credentials at rest. It accepts a
// 32-byte hex string (64 characters) or raw 32 bytes. An empty key leaves the
// store unable to hold credentials.
func (s *Store) SetEncryptionKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		s.aead = nil
		return nil
	}
	raw := []byte(key)
	if decoded, err := hex.DecodeString(key); err == nil && len(decoded) == 32 {
		raw = decoded
	}
	if len(raw) != 32 {
		return fmt.Errorf("encryption key must be 32 bytes or 64 hex characters, got %d", len(raw))
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return fmt.Errorf("build cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("build gcm: %w", err)
	}
	s.aead = aead
	return nil
}

// CanStoreSecrets reports whether the store can hold provider credentials.
func (s *Store) CanStoreSecrets() bool { return s.aead != nil }

// sealSecret encrypts plaintext for storage. An empty plaintext stores nothing
// rather than an encrypted empty string, so "no credentials" stays cheap to read.
func (s *Store) sealSecret(plaintext string) (string, error) {
	if plaintext == "" || plaintext == "{}" {
		return "", nil
	}
	if s.aead == nil {
		return "", ErrNoEncryptionKey
	}
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("read nonce: %w", err)
	}
	sealed := s.aead.Seal(nil, nonce, []byte(plaintext), nil)
	out := make([]byte, 0, 1+len(nonce)+len(sealed))
	out = append(out, secretVersion)
	out = append(out, nonce...)
	out = append(out, sealed...)
	return hex.EncodeToString(out), nil
}

// openSecret decrypts a stored value. A value that cannot be read returns "" so
// a rotated or missing key degrades to "no credentials" rather than failing the
// whole profile: the owner can enter them again, which nothing else recovers.
func (s *Store) openSecret(stored string) string {
	stored = strings.TrimSpace(stored)
	if stored == "" || stored == "{}" {
		return ""
	}
	if s.aead == nil {
		return ""
	}
	raw, err := hex.DecodeString(stored)
	if err != nil || len(raw) < 1+s.aead.NonceSize() {
		return ""
	}
	if raw[0] != secretVersion {
		return ""
	}
	nonce := raw[1 : 1+s.aead.NonceSize()]
	plain, err := s.aead.Open(nil, nonce, raw[1+s.aead.NonceSize():], nil)
	if err != nil {
		return ""
	}
	return string(plain)
}
