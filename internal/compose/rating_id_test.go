package compose

import (
	"testing"

	"xrdb_rewrite/internal/provider"
)

// AIOMetadata substitutes a tmdb: id when a title has no IMDb id in its index.
// Sources keyed by IMDb id return nothing for it, which is what left renders
// carrying genre and age badges but no rating badges.
func TestRatingIDPrefersTheIMDbIDForNonIMDbRequests(t *testing.T) {
	meta := &provider.MediaMeta{IMDbID: "tt0468569"}
	for _, tc := range []struct{ in, want string }{
		{"tmdb:movie:155", "tt0468569"},
		{"tmdb:series:1396", "tt0468569"},
		{"155", "tt0468569"},
		{"tvdb:81189", "tt0468569"},
		// An id already in IMDb form is left alone.
		{"tt0111161", "tt0111161"},
	} {
		if got := ratingIDForSources(tc.in, meta); got != tc.want {
			t.Errorf("ratingIDForSources(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestRatingIDKeepsTheEpisodeTail(t *testing.T) {
	meta := &provider.MediaMeta{IMDbID: "tt0944947"}
	if got := ratingIDForSources("tmdb:series:1399:1:1", meta); got != "tt0944947:1:1" {
		t.Errorf("got %q, want tt0944947:1:1", got)
	}
}

// Without an IMDb id to swap in there is nothing better than what was asked for.
func TestRatingIDFallsBackToTheRequestID(t *testing.T) {
	for _, meta := range []*provider.MediaMeta{nil, {}, {IMDbID: ""}} {
		if got := ratingIDForSources("tmdb:movie:155", meta); got != "tmdb:movie:155" {
			t.Errorf("got %q, want the request id unchanged", got)
		}
	}
}
