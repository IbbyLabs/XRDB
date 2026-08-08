package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// The ratings pass skips the provider that supplied the artwork, because it has
// already answered. It used to skip the provider that was *configured* as the
// artwork source, whether or not that source could serve the request. A source
// that fails and falls through to another then lost its rating as well as its
// artwork: the badge vanished and nothing recorded why (BUG-208, the cause of
// BUG-202, where Cinemeta cannot serve a raw episode id).
func TestRatingsPassSkipsTheProviderThatSuppliedTheArtwork(t *testing.T) {
	// A rating only the "failing artwork source" carries, so its presence proves
	// that provider was queried in the ratings pass.
	source := &provider.StubProvider{
		ProviderName: "cinemeta",
		Meta: &provider.MediaMeta{
			Ratings: []provider.Rating{{Source: "imdb", Value: 8.9, Label: "8.9"}},
		},
	}
	other := &provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{}}
	reg := provider.NewRegistry()
	reg.Register(source)
	reg.Register(other)
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkSource("cinemeta")
	cfg.Ratings = []string{"imdb"}
	req := Request{MediaType: "thumbnail", ContentType: "series", MediaID: "tt1", Config: cfg}

	// The artwork came from tmdb: cinemeta was configured but could not serve the
	// id, so the fallback supplied it. cinemeta must still be asked for ratings.
	req.artworkFrom = "tmdb"
	got, _, _, _, _, _ := p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
	if !hasSource(got, "imdb") {
		t.Error("the configured artwork source failed and fell through, but was skipped in the ratings pass anyway, losing its rating")
	}

	// When it did supply the artwork it is skipped, because it already answered.
	req.artworkFrom = "cinemeta"
	got, _, _, _, _, _ = p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
	if hasSource(got, "imdb") {
		t.Error("the provider that supplied the artwork was queried again in the ratings pass")
	}
}

func hasSource(ratings []provider.Rating, source string) bool {
	for _, r := range ratings {
		if r.Source == source {
			return true
		}
	}
	return false
}
