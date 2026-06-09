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
