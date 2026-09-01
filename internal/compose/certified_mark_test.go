package compose

import (
	"testing"

	"xrdb_rewrite/internal/certified"
	"xrdb_rewrite/internal/provider"
)

// The mark is Rotten Tomatoes' own. Where the file has an answer it is used;
// where it does not, the old approximation stands rather than the mark being
// withheld from every title the file has not reached yet (FR-158/161).
func TestTheCertifiedMarkPrefersTheFileOverTheApproximation(t *testing.T) {
	high := provider.Rating{Source: "rt", Value: 9.1, Votes: 200}

	// No file answer: the approximation applies, as it did before.
	if got := markStateFor(high, titleFacts{imdbID: "tt0000404"}); got != "critics-certified-fresh" {
		t.Errorf("unknown title = %q, want the approximation's mark", got)
	}

	certified.SetForTest(t, map[string]certified.Title{
		"tt0000001": {TopCritics: 9},
		"tt0000002": {TopCritics: 1},
	})

	if got := markStateFor(high, titleFacts{imdbID: "tt0000001"}); got != "critics-certified-fresh" {
		t.Errorf("a certified title = %q", got)
	}
	// The one the approximation gets wrong: a high score and plenty of reviews,
	// but not enough Top Critics. It is fresh rather than certified.
	if got := markStateFor(high, titleFacts{imdbID: "tt0000002"}); got != "critics-fresh" {
		t.Errorf("a title the file says is not certified = %q, want critics-fresh", got)
	}
}

// A title with no IMDb id cannot be looked up, and that must read as "no answer"
// rather than as "not certified".
func TestATitleWithNoIMDbIdKeepsTheApproximation(t *testing.T) {
	certified.SetForTest(t, map[string]certified.Title{"tt0000002": {TopCritics: 1}})
	high := provider.Rating{Source: "rt", Value: 9.1, Votes: 200}

	if got := markStateFor(high, titleFacts{}); got != "critics-certified-fresh" {
		t.Errorf("a title with no id = %q, want the approximation's mark", got)
	}
}
