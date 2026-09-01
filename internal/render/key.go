package render

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func CacheKey(parts ...string) string {
	normalized := strings.Join(parts, "|")
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}

// TypeSeparator divides the surface from the digest in a render cache key.
const TypeSeparator = ":"

// TypedCacheKey is CacheKey with the surface kept in front of the digest rather
// than folded into it.
//
// The digest is one-way, so a cache holding keys alone can say how many entries
// it has and nothing about what they are — no per-surface count, and no way to
// clear one surface without clearing all of them. Carrying the surface costs one
// short prefix and makes both answerable from the key.
//
// The surface is not a secret and is already in the URL that produced it.
func TypedCacheKey(mediaType string, parts ...string) string {
	return mediaType + TypeSeparator + CacheKey(append([]string{mediaType}, parts...)...)
}

// TypeOfKey reads the surface back out of a typed key. Empty for a key written
// before the surface was carried, which is what makes the change survivable: an
// old entry answers no per-surface question and ages out.
func TypeOfKey(key string) string {
	if i := strings.Index(key, TypeSeparator); i > 0 {
		return key[:i]
	}
	return ""
}
