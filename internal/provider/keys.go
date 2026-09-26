package provider

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
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
	return ownerCurrentKey(raw)
}

// keyForRequest returns the owner credential to send on an outgoing request, or
// "" when the render should use the server's. keyFrom answers whether a key
// exists and never rotates; this is the one call that may.
func keyForRequest(ctx context.Context, name string) string {
	if keyMode == rotateFill || ctx == nil {
		return keyFrom(ctx, name)
	}
	keys, _ := ctx.Value(keysCtxKey{}).(map[string]string)
	raw := keys[name]
	if !strings.Contains(raw, ",") || !rotatesForOwner(name) {
		return keyFrom(ctx, name)
	}
	return ownerSpreadKey(raw)
}

// ownerSpreadTurn counts owner-list requests. It is shared by every list, so a
// list's batches are approximate, and nothing grows with the number of lists.
var ownerSpreadTurn atomic.Uint64

// ownerSpreadKey returns the next credential in the list not marked spent,
// falling back to the fill choice when every one is.
func ownerSpreadKey(raw string) string {
	list := splitKeyList(raw)
	n := uint64(len(list))
	turn := (ownerSpreadTurn.Add(1) - 1) / uint64(keyBatch)
	start := turn
	if keyMode == rotateRandom {
		start = mix64(turn)
	}
	now := time.Now()
	ownerSpent.mu.Lock()
	for i := uint64(0); i < n; i++ {
		key := list[(start+i)%n]
		at, marked := ownerSpent.at[key]
		if !marked || now.Sub(at) >= keySpentFor {
			ownerSpent.mu.Unlock()
			return key
		}
	}
	ownerSpent.mu.Unlock()
	return ownerCurrentKey(raw)
}

// mix64 scrambles a batch number into a stable pseudo-random start (splitmix64).
func mix64(x uint64) uint64 {
	x += 0x9e3779b97f4a7c15
	x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9
	x = (x ^ (x >> 27)) * 0x94d049bb133111eb
	return x ^ (x >> 31)
}

// rotatesForOwner names the sources where several owner credentials are worth
// having. Rotation multiplies a daily quota and does nothing for a per-second
// rate, so a list anywhere else would be accepted and silently truncated.
func rotatesForOwner(name string) bool {
	switch name {
	case KeyMDBList, KeyOMDB, KeySIMKL:
		return true
	}
	return false
}

// ownerSpent records credentials a source has said are spent, keyed on the
// credential rather than on the list holding it. Keyed that way the map is
// bounded by keys actually refused in the last hour rather than by every
// distinct list anyone has ever sent, and two owners sharing a key share the
// knowledge that it is gone, which is right because they share the allowance.
var ownerSpent = struct {
	mu sync.Mutex
	at map[string]time.Time
}{at: map[string]time.Time{}}

// ownerCurrentKey returns the first credential in the list that is not marked
// spent. When every one is marked the marks are dropped and the first is
// returned, so an owner is never left with nothing to call.
func ownerCurrentKey(raw string) string {
	list := splitKeyList(raw)
	now := time.Now()
	ownerSpent.mu.Lock()
	defer ownerSpent.mu.Unlock()
	// Only this list's keys are looked at. This runs on the render path, and
	// walking the whole map here would make a popular multi-key profile pay for
	// every other owner's refusals. Stale marks are swept where they are
	// written instead, which is rare.
	for _, key := range list {
		at, marked := ownerSpent.at[key]
		if !marked {
			return key
		}
		if now.Sub(at) >= keySpentFor {
			delete(ownerSpent.at, key)
			return key
		}
	}
	for _, key := range list {
		delete(ownerSpent.at, key)
	}
	return list[0]
}

// noteOwnerKeySpent moves an owner's list on when the source says that
// credential's allowance is gone. The server's ring is untouched: a visitor
// spending their own allowance says nothing about ours.
func noteOwnerKeySpent(ctx context.Context, name, used string) {
	if ctx == nil || used == "" || !rotatesForOwner(name) {
		return
	}
	keys, _ := ctx.Value(keysCtxKey{}).(map[string]string)
	if !strings.Contains(keys[name], ",") {
		return
	}
	now := time.Now()
	ownerSpent.mu.Lock()
	defer ownerSpent.mu.Unlock()
	for key, at := range ownerSpent.at {
		if now.Sub(at) >= keySpentFor {
			delete(ownerSpent.at, key)
		}
	}
	if _, known := ownerSpent.at[used]; !known {
		ownerSpent.at[used] = now
	}
}
