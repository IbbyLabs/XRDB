package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"xrdb_rewrite/internal/settings"
)

const (
	// previewTokenTTL is how long a configurator preview token stays valid.
	previewTokenTTL = 2 * time.Hour
	// previewSecretKey names the settings row holding the hex signing secret.
	previewSecretKey = "preview_token_secret"
	previewSecretLen = 32
)

// previewSigner issues and verifies the short-lived tokens that let the
// configurator preview render with a saved profile's own provider keys.
type previewSigner struct {
	secret []byte
	now    func() time.Time
}

// newPreviewSigner loads the signing secret from the settings store, creating
// and storing one on first use. Without a usable store the secret lives only in
// memory, so issued tokens stop verifying when the process restarts.
func newPreviewSigner(store *settings.Store, logger *slog.Logger) *previewSigner {
	if logger == nil {
		logger = slog.Default()
	}
	s := &previewSigner{now: time.Now}
	if store != nil {
		if hexSecret, err := store.Get(previewSecretKey); err == nil {
			if b, derr := hex.DecodeString(hexSecret); derr == nil && len(b) == previewSecretLen {
				s.secret = b
				return s
			}
		}
	}
	s.secret = make([]byte, previewSecretLen)
	if _, err := rand.Read(s.secret); err != nil {
		panic("preview token secret: " + err.Error())
	}
	if store == nil {
		logger.Warn("No settings store is available, so preview tokens use a per-process secret and expire on restart")
		return s
	}
	if err := store.Set(previewSecretKey, hex.EncodeToString(s.secret)); err != nil {
		logger.Warn("Failed to persist the preview token secret, so tokens expire on restart", "error", err)
	}
	return s
}

func (s *previewSigner) mac(payload string) []byte {
	h := hmac.New(sha256.New, s.secret)
	h.Write([]byte(payload))
	return h.Sum(nil)
}

// issue returns a token for a profile ID, valid for previewTokenTTL.
func (s *previewSigner) issue(profileID string) string {
	if s == nil || profileID == "" {
		return ""
	}
	exp := s.now().Add(previewTokenTTL).Unix()
	payload := base64.RawURLEncoding.EncodeToString([]byte(profileID + "." + strconv.FormatInt(exp, 10)))
	return payload + "." + base64.RawURLEncoding.EncodeToString(s.mac(payload))
}

var errPreviewToken = errors.New("invalid preview token")

// verify returns the profile ID a token was issued for.
func (s *previewSigner) verify(token string) (string, error) {
	if s == nil {
		return "", errPreviewToken
	}
	payload, sig, ok := strings.Cut(token, ".")
	if !ok {
		return "", errPreviewToken
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(got, s.mac(payload)) {
		return "", errPreviewToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return "", errPreviewToken
	}
	i := strings.LastIndexByte(string(raw), '.')
	if i <= 0 {
		return "", errPreviewToken
	}
	exp, err := strconv.ParseInt(string(raw[i+1:]), 10, 64)
	if err != nil || s.now().Unix() >= exp {
		return "", errPreviewToken
	}
	return string(raw[:i]), nil
}
