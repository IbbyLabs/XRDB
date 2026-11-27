package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/settings"
)

type keyRecordingProvider struct {
	provider.StubProvider
	sawOwnerKey *bool
}

func (p *keyRecordingProvider) Fetch(ctx context.Context, mediaType, id string) (*provider.MediaMeta, error) {
	if provider.HasOwnerKey(ctx, "tmdb") {
		*p.sawOwnerKey = true
	}
	return p.StubProvider.Fetch(ctx, mediaType, id)
}

func previewHandler(t *testing.T, store *profile.Store, sawKey *bool, ss *settings.Store) http.Handler {
	t.Helper()
	reg := provider.NewRegistry()
	reg.Register(&keyRecordingProvider{
		StubProvider: provider.StubProvider{
			ProviderName: "tmdb",
			Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://fake/p.jpg"},
		},
		sawOwnerKey: sawKey,
	})
	pipeline := compose.NewWithFetcher(reg, fixedFetcher{data: testSourcePNG(t, 800, 1200)})
	c, _ := cache.New(filepath.Join(t.TempDir(), "cache"), time.Hour, 100, 8<<20)
	t.Cleanup(c.Close)
	return NewHandler("test", store, ss, pipeline, c, config.Config{})
}

func openStore(t *testing.T) *profile.Store {
	t.Helper()
	store, err := profile.Open(filepath.Join(t.TempDir(), "profiles.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := store.SetEncryptionKey("0123456789abcdef0123456789abcdef"); err != nil {
		t.Fatal(err)
	}
	return store
}

// The preview applies a saved profile's provider keys only for a valid signed
// token. Fetch metadata and the profile name are caller-supplied, so they prove
// nothing.
func TestPreviewAppliesProfileKeysOnlyWithAValidToken(t *testing.T) {
	store := openStore(t)
	if err := store.Save(&profile.Profile{
		ID: "abc123", Alias: "myprofile", Type: "poster",
		Config: json.RawMessage(`{}`), ProviderKeys: map[string]string{"tmdb": "owner-tmdb-key"},
		PasswordHash: mustHash(t, "owner-pw"),
	}); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(&profile.Profile{ID: "other1", Type: "poster", Config: json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}
	ss, err := settings.Open(filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ss.Close() })

	var sawKey bool
	h := previewHandler(t, store, &sawKey, ss)
	signer := newPreviewSigner(ss, nil)

	render := func(query, site string) bool {
		sawKey = false
		req := httptest.NewRequest(http.MethodGet, "/poster/tt1?config=%7B%7D&"+query, nil)
		if site != "" {
			req.Header.Set("Sec-Fetch-Site", site)
		}
		h.ServeHTTP(httptest.NewRecorder(), req)
		return sawKey
	}

	expired := newPreviewSigner(ss, nil)
	expired.now = func() time.Time { return time.Now().Add(-previewTokenTTL - time.Minute) }
	valid := signer.issue("abc123")

	// The token a configurator receives when it loads the profile.
	rr := httptest.NewRecorder()
	read := httptest.NewRequest(http.MethodGet, "/profile/myprofile", nil)
	read.Header.Set("X-Profile-Password", "owner-pw")
	h.ServeHTTP(rr, read)
	var loaded struct {
		PreviewToken string `json:"previewToken"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &loaded); err != nil || loaded.PreviewToken == "" {
		t.Fatalf("profile read carried no preview token: %v %s", err, rr.Body.String())
	}

	for name, tc := range map[string]struct{ query, site string }{
		"pk with a spoofed same-origin":    {"pk=myprofile&cb=1", "same-origin"},
		"pk by id with a spoofed referer":  {"pk=abc123&cb=2", ""},
		"forged token":                     {"pkt=" + valid[:len(valid)-2] + "xx&cb=3", "same-origin"},
		"token naming the wrong profile":   {"pkt=" + signer.issue("other1") + "&cb=4", "same-origin"},
		"expired token":                    {"pkt=" + expired.issue("abc123") + "&cb=5", "same-origin"},
		"token signed with another secret": {"pkt=" + newPreviewSigner(nil, nil).issue("abc123") + "&cb=6", "same-origin"},
		"garbage token":                    {"pkt=not-a-token&cb=7", "same-origin"},
	} {
		if render(tc.query, tc.site) {
			t.Errorf("%s borrowed the profile's provider key", name)
		}
	}

	if !render("pkt="+valid+"&cb=8", "cross-site") {
		t.Error("a valid token did not apply the profile's provider key")
	}
	if !render("pkt="+loaded.PreviewToken+"&cb=9", "") {
		t.Error("the token from the profile read did not apply the provider key")
	}
}

// Adding or changing a provider key changes the render, so it must move the
// cache key even though the profile config bytes are unchanged. This is the
// stale-render bug: a key added to a saved profile was served the pre-key image.
func TestAProviderKeyChangeMovesTheCacheKey(t *testing.T) {
	store := openStore(t)
	var sawKey bool
	h := previewHandler(t, store, &sawKey, nil)

	keyFor := func(alias string) string {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt1?config="+alias, nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("%s: got %d", alias, rr.Code)
		}
		return rr.Header().Get("X-Cache-Key")
	}

	// No keys yet.
	if err := store.Save(&profile.Profile{
		ID: "p1", Alias: "keyless", Type: "poster", Config: json.RawMessage(`{}`),
	}); err != nil {
		t.Fatal(err)
	}
	before := keyFor("keyless")

	// A profile with a key, otherwise identical config.
	if err := store.Save(&profile.Profile{
		ID: "p2", Alias: "keyed", Type: "poster", Config: json.RawMessage(`{}`),
		ProviderKeys: map[string]string{"tmdb": "a-key"},
	}); err != nil {
		t.Fatal(err)
	}
	withKey := keyFor("keyed")

	if before == withKey {
		t.Error("a provider key did not move the cache key, so the pre-key render would be served stale")
	}
}

func mustHash(t *testing.T, pw string) string {
	t.Helper()
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return string(h)
}

// A passwordless profile can hold no keys, so reading it hands out no token
// that could outlive a password and keys added later.
func TestPasswordlessProfileReadCarriesNoPreviewToken(t *testing.T) {
	store := openStore(t)
	if err := store.Save(&profile.Profile{ID: "open01", Alias: "openprofile", Type: "poster", Config: json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}
	h := NewHandler("test", store, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/profile/openprofile", nil))
	if rr.Code != http.StatusOK || strings.Contains(rr.Body.String(), "previewToken") {
		t.Errorf("passwordless profile read: %d %s, want no previewToken", rr.Code, rr.Body.String())
	}
}
