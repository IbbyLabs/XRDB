package compose

import (
	"testing"

	"xrdb_rewrite/internal/provider"
)

// The mark says Ebert wrote a Great Movies essay on this film. That is a claim
// about the film rather than about its score, so it cannot be derived from the
// rating and has to arrive as a fact about the title.
func TestTheGreatMovieMarkFollowsTheTitleNotTheScore(t *testing.T) {
	ebert := provider.Rating{Source: "rogerebert", Value: 8.75, Label: "3.5"}

	if got := markStateFor(ebert, titleFacts{isGreatMovie: true, greatMovieKnown: true}); got != "rogerebert-great-movie" {
		t.Errorf("a Great Movie got %q, want the great-movie mark", got)
	}
	if got := markStateFor(ebert, titleFacts{isGreatMovie: false, greatMovieKnown: true}); got != "" {
		t.Errorf("a film with no essay got %q, want the plain mark", got)
	}

	// The same score either way: if the mark tracked the rating rather than the
	// title, both calls above would agree.
	low := provider.Rating{Source: "rogerebert", Value: 2.5, Label: "1"}
	if got := markStateFor(low, titleFacts{isGreatMovie: true, greatMovieKnown: true}); got != "rogerebert-great-movie" {
		t.Errorf("a Great Movie with a low score got %q; the mark must follow the essay, not the stars", got)
	}
}

// Unknown is not no. A title identified only by a TMDB id cannot be looked up,
// and denying it the mark would be a claim nobody checked — invisible, because a
// missing mark looks exactly like a film that never earned one.
func TestAnUnknownTitleKeepsThePlainMark(t *testing.T) {
	ebert := provider.Rating{Source: "rogerebert", Value: 8.75, Label: "3.5"}
	if got := markStateFor(ebert, titleFacts{isGreatMovie: true, greatMovieKnown: false}); got != "" {
		t.Errorf("an unlooked-up title got %q, want the plain mark", got)
	}
}

// The ring is full-colour artwork. If it read as greyscale the renderer would
// fill it with the source accent and the gold would vanish, which is the defect
// that took the plain Ebert mark out for months.
func TestTheGreatMovieRingDrawsInColour(t *testing.T) {
	ensureIcons()
	facts := titleFacts{isGreatMovie: true, greatMovieKnown: true}
	r := provider.Rating{Source: "rogerebert", Value: 8.75, Label: "3.5"}
	if ratingMark(r, facts) == nil {
		t.Fatal("the great-movie mark did not load")
	}
	if !ratingMarkColored(r, facts) {
		t.Error("the great-movie ring would be tinted flat instead of drawn as artwork")
	}
	// And it must actually differ from the plain mark, or nothing is gained.
	plain := ratingMark(r, titleFacts{greatMovieKnown: true})
	if plain == nil {
		t.Fatal("the plain Ebert mark did not load")
	}
	if plain == ratingMark(r, facts) {
		t.Error("the Great Movie mark and the plain mark are the same image")
	}
}

// Only Roger Ebert carries this. A film being a Great Movie says nothing about
// how any other source rated it.
func TestOtherSourcesIgnoreTheGreatMovieFact(t *testing.T) {
	facts := titleFacts{isGreatMovie: true, greatMovieKnown: true}
	for _, src := range []string{"imdb", "tmdb", "letterboxd", "metacriticuser"} {
		if got := markStateFor(provider.Rating{Source: src, Value: 8.0}, facts); got != "" {
			t.Errorf("%s got mark %q from a Great Movies fact", src, got)
		}
	}
}
