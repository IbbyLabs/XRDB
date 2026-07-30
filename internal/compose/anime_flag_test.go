package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// The anime rating override is resolved from the anime flag, so asking for one
// has to be reason enough to run the lookup. Without this the override is dead
// unless some other anime-dependent option happens to be on.
func TestAnAnimeRatingOverrideRequestsTheAnimeLookup(t *testing.T) {
	plain := imageconfig.Default()
	if needsAnimeFlag(plain) {
		t.Fatal("a plain config asked for the anime lookup")
	}

	withOverride := plain
	withOverride.RatingsAnime = []string{"mal"}
	if !needsAnimeFlag(withOverride) {
		t.Error("an anime rating override did not ask for the anime lookup")
	}

	// A movie or series override needs no lookup: the kind comes from the request.
	movieOnly := plain
	movieOnly.RatingsMovie = []string{"imdb"}
	if needsAnimeFlag(movieOnly) {
		t.Error("a movie override asked for the anime lookup")
	}
}
