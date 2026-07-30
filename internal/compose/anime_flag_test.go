package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
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

// A rating source can supply an age rating for a title the artwork source has
// no certification for, but it must never overwrite one that is already there.
func TestARatingSourceOnlyFillsAMissingAgeRating(t *testing.T) {
	empty := &provider.MediaMeta{}
	fillContentRating(empty, "9+")
	if empty.ContentRating != "9+" {
		t.Errorf("a missing age rating was not filled: %q", empty.ContentRating)
	}

	certified := &provider.MediaMeta{ContentRating: "R"}
	fillContentRating(certified, "9+")
	if certified.ContentRating != "R" {
		t.Errorf("an existing certification was overwritten: %q", certified.ContentRating)
	}
}
