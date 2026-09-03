package server

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// v2-compatible media id shim.
//
// v2 served artwork under URLs whose id segment carried a file extension, and
// sometimes an "imdb:" scheme prefix:
//
//	/poster/tt0816692.jpg
//	/poster/imdb:tt0816692.jpg
//	/thumbnail/tt0903747:1:1.jpg
//
// The render route reads that segment as an identifier, so an extension or a
// scheme prefix leaves it unresolvable and the request falls back to the
// "artwork not found" placeholder. Nothing surfaces that: a media app quietly
// shows the original artwork instead, so a configured URL looks like it works
// while styling silently stops being applied.
//
// Normalising the id means artwork URLs written against v2 keep resolving
// without anyone editing them. TMDB-shaped ids ("tmdb:movie:155") already
// resolve with or without an extension, and are normalised anyway so both
// spellings share one cache entry rather than rendering the same image twice.

// legacyIDExtensions are the extensions v2 served artwork under. Only these are
// stripped, so an identifier that merely contains a dot is left alone.
var legacyIDExtensions = []string{".jpg", ".jpeg", ".png", ".webp"}

// normalizeLegacyMediaID rewrites a v2-shaped id into the form the render route
// resolves. An id already in the current shape is returned unchanged.
func normalizeLegacyMediaID(id string) string {
	// "imdb:tt0816692" says nothing the bare tt-id does not: the tt prefix
	// already names the source. A "tmdb:" scheme is kept, because the rating
	// providers read the content type out of it and guessing movie-vs-series
	// is what drops most of a series' ratings.
	if rest := strings.TrimPrefix(id, "imdb:"); rest != id && rest != "" {
		id = rest
	}
	for _, ext := range legacyIDExtensions {
		// Longer-than, not equal-to: an id that is nothing but an extension has
		// no identifier left once stripped, so leave it to fail as it would have.
		if len(id) > len(ext) && strings.EqualFold(id[len(id)-len(ext):], ext) {
			return id[:len(id)-len(ext)]
		}
	}
	return id
}

// legacyEpisodeToken matches the second path segment v2 served episode stills
// under: /thumbnail/{id}/S{season}E{episode}, with an optional image extension.
var legacyEpisodeToken = regexp.MustCompile(`(?i)^s(\d+)e(\d+)(?:\.jpg|\.jpeg|\.png|\.webp)?$`)

// legacyEpisodeID folds a v2 episode token into the single-segment id the render
// route resolves. The numbers are parsed rather than copied, so S04E15 and S4E15
// share one cache entry.
func legacyEpisodeID(id, token string) (string, bool) {
	m := legacyEpisodeToken.FindStringSubmatch(token)
	if m == nil {
		return "", false
	}
	season, err := strconv.Atoi(m[1])
	if err != nil {
		return "", false
	}
	episode, err := strconv.Atoi(m[2])
	if err != nil {
		return "", false
	}
	return fmt.Sprintf("%s:%d:%d", normalizeLegacyMediaID(id), season, episode), true
}
