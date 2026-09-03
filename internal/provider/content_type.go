package provider

import (
	"context"
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

// ErrNotApplicable is a sentinel returned when a source cannot apply to a title
// at all, rather than failing to answer for it. An anime source asked about a
// non-anime is the case: "this is not an anime" is a permanent fact about the
// title, not an outage, so it must not count against the source's health or a
// genuine failure would be lost in the noise.
var ErrNotApplicable = errors.New("provider: source does not apply to this title")

// Applicability is implemented by a source that can tell, from the title's
// identity, whether it can answer for it at all. The render asks this of a
// source before it asks whether that source is available, so an answer of false
// keeps the title out of every hold-out gate.
//
// It is asked inside the render's per-source goroutine and may do the same
// lookup the fetch would, including one that reaches a network. It must not be
// moved in front of the fan-out.
type Applicability interface {
	AppliesTo(ctx context.Context, mediaType, id string) bool
}

// SeriesScoped marks a source that answers per series and has no per-episode
// entry. The render asks these about the series id even when the request names
// an episode.
type SeriesScoped interface {
	SeriesScoped() bool
}

// AsksAboutTheSeries reports whether prov wants the series id in place of an
// episode one.
func AsksAboutTheSeries(prov Provider) bool {
	s, ok := prov.(SeriesScoped)
	return ok && s.SeriesScoped()
}

// SourceApplies reports whether prov can answer for this title. A source that
// does not declare applicability applies to everything, so a source that cannot
// decide is still tried rather than silently dropped.
func SourceApplies(ctx context.Context, prov Provider, mediaType, id string) bool {
	a, ok := prov.(Applicability)
	return !ok || a.AppliesTo(ctx, mediaType, id)
}

// isIMDbTitleID reports whether id is an IMDb title id. Sources keyed on IMDb
// answer for nothing else.
func isIMDbTitleID(id string) bool { return strings.HasPrefix(id, "tt") }

// ErrUpstreamUnavailable reports that a source answered and its own upstream did
// not. Jikan returns it per title: a broken anime id 504s in about 130ms with
// "MyAnimeList may be down/unavailable or refuses to connect" while other ids
// answer 200 in the same second. It is a fact about the title, so it must not be
// recorded against the source: five broken ids in a row would otherwise take the
// source off every poster, including the titles that work.
var ErrUpstreamUnavailable = errors.New("provider: the source's own upstream is unavailable")

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
