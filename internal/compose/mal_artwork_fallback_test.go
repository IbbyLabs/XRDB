package compose

import (
	"slices"
	"testing"
)

// A title exists before the anime map knows its TMDB id, and in that window the
// general sources cannot answer for a mal: id at all — the render came back
// blank. MAL's own image server has the artwork for exactly that window
// (BUG-278).
func TestAMalIdFallsBackToMALsOwnArtwork(t *testing.T) {
	p := &Pipeline{}
	order := p.artworkOrderFor("tmdb", "poster", "mal:62546")

	if !slices.Contains(order, "mal") {
		t.Fatalf("order %v does not reach MAL, so an unmapped title has nothing to draw", order)
	}
	// Last rather than first: a title the map already knows keeps the source its
	// config asked for.
	if order[0] != "tmdb" {
		t.Errorf("order %v puts something before the configured source", order)
	}
	if order[len(order)-1] != "mal" {
		t.Errorf("order %v does not put MAL last", order)
	}
}

// The kind prefix AIOMetadata emits must not hide the id's scheme.
func TestAPrefixedMalIdStillReachesMAL(t *testing.T) {
	p := &Pipeline{}
	for _, id := range []string{"mal:62546", "series:mal:62546", "movie:mal:62546"} {
		if !slices.Contains(p.artworkOrderFor("tmdb", "poster", id), "mal") {
			t.Errorf("%s does not reach MAL", id)
		}
	}
}

// The control: an id of any other scheme does not gain MAL, so this is a
// fallback for one id shape rather than a source added to every render.
func TestOtherIdsDoNotGainMAL(t *testing.T) {
	p := &Pipeline{}
	for _, id := range []string{"tt0111161", "tmdb:550", "kitsu:7442", ""} {
		if slices.Contains(p.artworkOrderFor("tmdb", "poster", id), "mal") {
			t.Errorf("%q gained MAL as an artwork source", id)
		}
	}
}
