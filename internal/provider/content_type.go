package provider

import (
	"errors"
	"strings"
)

// errNotFound is a sentinel returned by provider fetch helpers when the upstream
// reports that the title does not exist for the content type that was attempted
// (typically HTTP 404). An IMDb tt-ID maps to exactly one title, so a "movie"
// miss means the title is a series (and vice versa). Callers use this sentinel
// to retry the other content type instead of dropping the rating entirely.
//
// This is the safety net for decoupling the artwork surface from the content
// type: even when the caller cannot tell us whether an ID is a movie or a
// series, the provider self-corrects rather than silently returning nothing.
var errNotFound = errors.New("provider: title not found for content type")

// isSeriesType reports whether a content-type hint denotes a series/TV title.
//
// It intentionally does NOT treat artwork surface names (poster, backdrop,
// logo, thumbnail) as content-type hints. Surfaces are decoupled from content
// type; conflating them is the bug that made series posters/logos resolve as
// movies and drop their ratings. Unknown or empty values are treated as
// non-series (movie-first); callers fall back to the other type on errNotFound.
func isSeriesType(t string) bool {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "series", "tv", "show", "shows":
		return true
	default:
		return false
	}
}

// IsSeriesContentType is isSeriesType for callers outside the package.
func IsSeriesContentType(t string) bool { return isSeriesType(t) }

// isMovieType reports whether a content-type hint commits to a movie. An empty
// or unrecognised hint does not.
func isMovieType(t string) bool {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "movie", "movies", "film":
		return true
	default:
		return false
	}
}
