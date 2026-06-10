package provider

import "context"

// ArtworkOptions carries the config-driven artwork preferences a provider can
// honor when selecting which image variant to return.
type ArtworkOptions struct {
	Language       string // preferred artwork language code, e.g. "en", "ja"
	TextPreference string // original | clean | textless | alternative | random
	Size           string // normal | large | 4k — drives source resolution
}

// ArtworkFetcher is an optional interface for providers that can apply
// ArtworkOptions during fetch. Providers that don't implement it are called
// through plain Fetch and ignore these preferences.
type ArtworkFetcher interface {
	FetchArtwork(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error)
}
