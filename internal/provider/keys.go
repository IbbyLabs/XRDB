package provider

import (
	"context"
	"sort"
	"strings"
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
	KeyOMDB    = "omdb"
	KeyFanart  = "fanart"
	KeyTrakt   = "trakt"
	KeySIMKL   = "simkl"
)

// SupportedKeys are the providers that read an owner-supplied credential.
var SupportedKeys = []string{KeyTMDB, KeyMDBList, KeyOMDB, KeyFanart, KeyTrakt, KeySIMKL}

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

// keyFrom returns the owner-supplied credential for name, or "" when the render
// should use the server's.
func keyFrom(ctx context.Context, name string) string {
	if ctx == nil {
		return ""
	}
	keys, _ := ctx.Value(keysCtxKey{}).(map[string]string)
	return keys[name]
}
