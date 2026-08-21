package server

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// A per-type override makes the same config render differently for a movie and
// for a series, so the kind has to reach the cache key or the two collide.
func TestPerTypeOverridePutsTheKindInTheCacheKey(t *testing.T) {
	plain := imageconfig.Default()
	plain.Ratings = []string{"imdb"}
	if imageconfig.HasPerTypeRatings(plain) {
		t.Fatal("a config with no override reported one")
	}

	override := plain
	override.RatingsMovie = []string{"imdb", "tmdb"}
	if !imageconfig.HasPerTypeRatings(override) {
		t.Fatal("a config with a movie override reported none")
	}

	base := imageconfig.CacheKey(override)
	movie := base + ":ct=movie"
	series := base + ":ct=series"
	if movie == series {
		t.Fatal("movie and series produced the same key")
	}
}

// ?type= picks which TMDB endpoint answers a bare id, so it selects the artwork
// rather than only styling it, and has to reach the cache key. An id carrying
// its own kind token already keys apart.
func TestABareTMDBIdIsKindAmbiguous(t *testing.T) {
	for _, c := range []struct {
		id   string
		want bool
	}{
		{"tmdb:279413", true},
		{"tmdb:1", true},
		{"tmdb:tv:279413", false},
		{"tmdb:movie:279413", false},
		{"tmdb:series:279413", false},
		{"tt0111161", false},
		{"tvdb:81189", false},
		{"tmdb:", false},
		{"tmdb:12a", false},
		{"", false},
	} {
		if got := idKindIsAmbiguous(c.id); got != c.want {
			t.Errorf("idKindIsAmbiguous(%q) = %v, want %v", c.id, got, c.want)
		}
	}
}
