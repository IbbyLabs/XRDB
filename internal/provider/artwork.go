package provider

import (
	"context"
	"strings"
)

// OriginalLanguage asks for artwork in whichever language the title itself was
// made in, resolved per title rather than fixed in the config. Seven Samurai
// renders Japanese, The Matrix renders English, from one setting.
const OriginalLanguage = "original"

// IsOriginalLanguage reports whether a language selection means "the title's
// own", rather than a specific code.
func IsOriginalLanguage(v string) bool {
	return strings.EqualFold(strings.TrimSpace(v), OriginalLanguage)
}

// ArtworkOptions carries the config-driven artwork preferences a provider can
// honor when selecting which image variant to return.
type ArtworkOptions struct {
	// WatchProvidersCountry is the ISO 3166-1 region for streaming availability.
	// Empty means US.
	WatchProvidersCountry string
	// Language is an artwork language code such as "en" or "ja", or
	// OriginalLanguage for the title's own.
	Language string
	// FallbackLanguage is tried when Language finds no art, before English.
	FallbackLanguage string
	// TMDBID is TMDB's id for the requested title, when the caller resolved one.
	// Sources matched through a third-party id index check their record against
	// it. Release names diverge between sources; ids do not.
	TMDBID         string
	TextPreference string // original | clean | textless | alternative | random
	Size           string // normal | large | 4k — drives source resolution
	// Filters applied when TextPreference is "random".
	RandomText         string // any | text | textless; "" = any
	RandomLanguage     string // any | requested; "" = any
	RandomMinVoteCount int    // skip candidates below this vote count
	RandomMinVoteAvg   float64
	RandomMinWidth     int
	RandomMinHeight    int
	RandomFallback     string // best | original; "" = best
}

// ArtworkFetcher is an optional interface for providers that can apply
// ArtworkOptions during fetch. Providers that don't implement it are called
// through plain Fetch and ignore these preferences.
type ArtworkFetcher interface {
	FetchArtwork(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error)
}

// TitleIdentifier resolves what an external id (an IMDb tt-id or "tvdb:") names.
// hint is the content type the caller already knows, or "". contentType is
// "movie" or "series".
type TitleIdentifier interface {
	IdentifyID(ctx context.Context, id, hint string) (tmdbID, contentType string, err error)
}
