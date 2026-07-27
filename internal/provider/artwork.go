package provider

import "context"

// ArtworkOptions carries the config-driven artwork preferences a provider can
// honor when selecting which image variant to return.
type ArtworkOptions struct {
	// WatchProvidersCountry is the ISO 3166-1 region for streaming availability.
	// Empty means US.
	WatchProvidersCountry string
	Language              string // preferred artwork language code, e.g. "en", "ja"
	// Title is the title the caller already resolved, when it has one. Sources
	// matched through a third-party id index check their record against it.
	Title          string
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
// contentType is "movie" or "series".
type TitleIdentifier interface {
	IdentifyID(ctx context.Context, id string) (title, contentType string, err error)
}
