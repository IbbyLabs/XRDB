package provider

import (
	"fmt"
	"regexp"
	"strings"
)

// A credential that does not match its provider's shape is rejected when it is
// saved rather than routed on a guess. TMDB in particular issues two kinds that
// go to different endpoints, and silently filing one as the other turns every
// later render into an unexplained failure — the setting looks accepted and the
// artwork just stops carrying ratings.

var (
	tmdbV3Re = regexp.MustCompile(`^[a-f0-9]{32}$`)
	// A JWT is three base64url segments; TMDB's v4 read token is one.
	jwtRe = regexp.MustCompile(`^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$`)
	// The remaining providers issue opaque ids. Length and alphabet are all
	// that can be checked without calling them.
	opaqueRe = regexp.MustCompile(`^[A-Za-z0-9_.:-]{8,200}$`)
)

// IsTMDBReadToken reports whether the credential is a v4 read token rather than
// a v3 API key. The two go to different slots.
func IsTMDBReadToken(key string) bool {
	return strings.HasPrefix(key, "eyJ") && jwtRe.MatchString(key)
}

// ValidateKey checks a credential against the shape its provider issues.
// The message is written for the person pasting it.
func ValidateKey(name, key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil // clearing a key is always allowed
	}
	switch name {
	case KeyTMDB:
		if tmdbV3Re.MatchString(strings.ToLower(key)) || IsTMDBReadToken(key) {
			return nil
		}
		return fmt.Errorf("that does not look like a TMDB credential: expected a 32-character API key, or a read access token starting with eyJ")
	case KeyMDBList, KeyOMDB, KeyFanart, KeyTrakt, KeySIMKL:
		if opaqueRe.MatchString(key) {
			return nil
		}
		return fmt.Errorf("that does not look like a %s key", providerLabel(name))
	}
	return fmt.Errorf("%q is not a provider a key can be supplied for", name)
}

// ValidateKeys checks every supplied credential, naming the first that fails so
// the caller can say which field to fix. A field may hold several credentials
// separated by commas, and each is checked on its own: one bad entry in a list
// is still a bad credential.
func ValidateKeys(keys map[string]string) error {
	for _, name := range SortedNames(keys) {
		for _, one := range splitKeyList(keys[name]) {
			if err := ValidateKey(name, one); err != nil {
				return err
			}
		}
	}
	return nil
}

// splitKeyList takes a credential field apart. A field with no comma is a list
// of one, so a single key behaves exactly as it always has.
func splitKeyList(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	if len(out) == 0 {
		return []string{""}
	}
	return out
}

func providerLabel(name string) string {
	switch name {
	case KeyMDBList:
		return "MDBList"
	case KeyOMDB:
		return "OMDb"
	case KeyFanart:
		return "Fanart.tv"
	case KeyTrakt:
		return "Trakt"
	case KeySIMKL:
		return "SIMKL"
	case KeyTMDB:
		return "TMDB"
	}
	return name
}
