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
