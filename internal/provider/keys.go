package provider

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"
	"sync"
)

// A profile owner can supply their own provider credentials, which stand in for
// the server's for that profile's renders. Providers are built once at startup,
// so the override rides on the request context rather than through a second set
// of provider instances.
//
// Values only ever travel inward: they are never logged, never returned by the
// API, and never part of a cache key — two owners fetching the same title with
// different credentials get the same artwork, so keying on them would only
// fragment the cache and put key material in a key.

type keysCtxKey struct{}

// Names are the provider identifiers a key can be supplied for. They match the
// provider names so the UI, the store and the fallback all agree.
const (
	KeyTMDB    = "tmdb"
	KeyMDBList = "mdblist"
	KeyMediux  = "mediux"
	KeyOMDB    = "omdb"
	KeyFanart  = "fanart"
	KeyTrakt   = "trakt"
	KeySIMKL   = "simkl"
)

// SupportedKeys are the providers that read an owner-supplied credential.
var SupportedKeys = []string{KeyTMDB, KeyMDBList, KeyMediux, KeyOMDB, KeyFanart, KeyTrakt, KeySIMKL}

// SupportsKey reports whether name is a provider a key can be supplied for.
func SupportsKey(name string) bool {
	for _, k := range SupportedKeys {
		if k == name {
			return true
		}
	}
	return false
}

// FilterSupported drops entries that are blank or name a provider with no
// owner-supplied credential, so a stored map cannot accumulate junk.
func FilterSupported(in map[string]string) map[string]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]string, len(in))
	for k, v := range in {
		k = strings.ToLower(strings.TrimSpace(k))
		if v = strings.TrimSpace(v); v != "" && SupportsKey(k) {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// SortedNames returns the provider names present, for a stable UI listing.
func SortedNames(in map[string]string) []string {
	out := make([]string, 0, len(in))
	for k := range in {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// WithKeys returns a context carrying the owner's credentials.
func WithKeys(ctx context.Context, keys map[string]string) context.Context {
	if len(keys) == 0 {
		return ctx
	}
	return context.WithValue(ctx, keysCtxKey{}, keys)
}

// KeysFrom returns a copy of the credentials a render carries. A copy because
// the map may be a stored profile's own, and adding a key to that would give it
// to every later render of that profile.
func KeysFrom(ctx context.Context) map[string]string {
	keys, _ := ctx.Value(keysCtxKey{}).(map[string]string)
	out := make(map[string]string, len(keys)+1)
	for name, value := range keys {
		out[name] = value
	}
	return out
}

// KeysFingerprint returns a short, stable digest of an owner's key set. It goes
// into the render cache key so a key change refreshes the render, without the
// secret values appearing anywhere: it is an 8-byte SHA-256 prefix, not the keys.
func KeysFingerprint(keys map[string]string) string {
	if len(keys) == 0 {
		return ""
	}
	names := make([]string, 0, len(keys))
	for k := range keys {
		names = append(names, k)
	}
	sort.Strings(names)
	h := sha256.New()
	for _, k := range names {
		h.Write([]byte(k))
		h.Write([]byte{0})
		h.Write([]byte(keys[k]))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil)[:8])
}

// HasOwnerKey reports whether the render carries an owner-supplied credential
// for the named provider. The key names match the provider names, so a provider
// can ask with its own Name(). An owner key has its own upstream allowance, so
// it must not be gated out by the shared key's rate-limit cooldown.
func HasOwnerKey(ctx context.Context, name string) bool {
	return keyFrom(ctx, name) != ""
}

// MediuxTokenFor returns the MediUX token for a render: the owner's own if the
// context carries one, else the given instance default.
func MediuxTokenFor(ctx context.Context, instanceKey string) string {
	if k := keyFrom(ctx, KeyMediux); k != "" {
		return k
	}
	return instanceKey
}

// keyFrom returns the owner-supplied credential for name, or "" when the render
// should use the server's.
func keyFrom(ctx context.Context, name string) string {
	if ctx == nil {
		return ""
	}
	keys, _ := ctx.Value(keysCtxKey{}).(map[string]string)
	raw := keys[name]
	if !strings.Contains(raw, ",") {
		return strings.TrimSpace(raw)
	}
	return ownerRing(name, raw).current()
}

// ownerRings holds one ring per owner credential list, so a spent key rotates
// for that owner alone. Keyed on the field's own text: two profiles pasting the
// same keys share a ring, which is right, because they share the allowance.
// Only a field holding several credentials reaches here, so an ordinary
// single-key profile adds nothing.
var ownerRings sync.Map // name + "\x00" + raw -> *keyRing

func ownerRing(name, raw string) *keyRing {
	k := name + "\x00" + raw
	if r, ok := ownerRings.Load(k); ok {
		return r.(*keyRing)
	}
	r, _ := ownerRings.LoadOrStore(k, newKeyRing(raw))
	return r.(*keyRing)
}

// noteOwnerKeySpent moves an owner's list on when the source says that
// credential's allowance is gone. The server's ring is untouched: a visitor
// spending their own allowance says nothing about ours.
func noteOwnerKeySpent(ctx context.Context, name, used string) {
	if ctx == nil || used == "" {
		return
	}
	keys, _ := ctx.Value(keysCtxKey{}).(map[string]string)
	raw := keys[name]
	if !strings.Contains(raw, ",") {
		return
	}
	ownerRing(name, raw).markSpent(used)
}
