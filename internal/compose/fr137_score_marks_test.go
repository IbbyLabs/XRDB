package compose

import (
	"testing"

	"xrdb_rewrite/internal/provider"
)

// A Rotten Tomatoes or Metacritic mark is a function of its score: the state
// changes at the band boundaries rather than being one fixed image per source.
func TestMarkStateForPicksTheScoreBand(t *testing.T) {
	cases := []struct {
		source string
		value  float64
		want   string
	}{
		{"rt", 9.0, "critics-certified-fresh"},
		{"rt", 7.5, "critics-certified-fresh"},
		{"rt", 7.4, "critics-fresh"},
		{"rt", 6.0, "critics-fresh"},
		{"rt", 5.9, "critics-rotten"},
		{"rt", 1.0, "critics-rotten"},
		{"rtaudience", 6.0, "audience-upright"},
		{"rtaudience", 5.9, "audience-spilled"},
		{"metacritic", 8.1, "metacritic-award-deepgold"},
		{"metacritic", 8.0, ""},
		{"metacriticuser", 9.0, ""},
		{"imdb", 8.7, ""},
		{"rt", 0, ""},
	}
	for _, c := range cases {
		got := markStateFor(provider.Rating{Source: c.source, Value: c.value}, titleFacts{})
		if got != c.want {
			t.Errorf("markStateFor(%s @ %.1f, titleFacts{}) = %q, want %q", c.source, c.value, got, c.want)
		}
	}
}

// The score-dependence has to reach the drawn mark, not just the name: a fresh
// score and a rotten score must resolve to different images. A fixed-per-source
// lookup returns the same mark for both and fails here.
func TestRatingMarkDiffersByScore(t *testing.T) {
	ensureIcons()
	fresh := ratingMark(provider.Rating{Source: "rt", Value: 9.0}, titleFacts{})
	rotten := ratingMark(provider.Rating{Source: "rt", Value: 3.0}, titleFacts{})
	if fresh == nil || rotten == nil {
		t.Fatal("RT marks did not load")
	}
	if fresh == rotten {
		t.Error("a fresh and a rotten RT score resolved to the same mark")
	}
	award := ratingMark(provider.Rating{Source: "metacritic", Value: 8.5}, titleFacts{})
	plain := ratingMark(provider.Rating{Source: "metacritic", Value: 7.0}, titleFacts{})
	if award == nil || plain == nil {
		t.Fatal("Metacritic marks did not load")
	}
	if award == plain {
		t.Error("an award-tier and a plain Metacritic score resolved to the same mark")
	}
}

// The score-band marks are full-colour brand art and must draw as-is. If one
// read as greyscale the renderer would tint it with the amber accent, turning a
// green splat or a gold disc amber.
func TestScoreBandMarksDrawInColour(t *testing.T) {
	ensureIcons()
	drawnInColour := []provider.Rating{
		{Source: "rt", Value: 9.0},
		{Source: "rt", Value: 7.0},
		{Source: "rt", Value: 3.0},
		{Source: "rtaudience", Value: 7.0},
		{Source: "rtaudience", Value: 3.0},
		{Source: "metacritic", Value: 8.5},
	}
	for _, r := range drawnInColour {
		if !ratingMarkColored(r, titleFacts{}) {
			t.Errorf("%s @ %.1f would be tinted with the accent instead of drawn in colour", r.Source, r.Value)
		}
	}
}

// FR-157: an award tier claims a title is well reviewed, not merely well scored,
// and the review count arrives with the rating. Metacritic publishes Must-See as
// 81+ from at least 15 publications, so that tier becomes exact rather than
// approximated; Certified Fresh gets a review floor it did not have.
func TestAwardMarksNeedTheReviewCount(t *testing.T) {
	cases := []struct {
		name   string
		source string
		value  float64
		votes  int
		want   string
	}{
		// The property named in the request: same score, different review counts.
		{"metacritic thinly reviewed", "metacritic", 8.5, 9, ""},
		{"metacritic broadly reviewed", "metacritic", 8.5, 20, "metacritic-award-deepgold"},
		{"metacritic exactly at the floor", "metacritic", 8.5, 15, "metacritic-award-deepgold"},
		{"metacritic one short", "metacritic", 8.5, 14, ""},

		{"rt certified needs its floor", "rt", 9.0, 39, "critics-fresh"},
		{"rt certified clears its floor", "rt", 9.0, 40, "critics-certified-fresh"},

		// A count of zero means the source sent none, not that the title has none.
		// Treating it as a shortfall would strip the mark wherever the figure is
		// simply absent.
		{"metacritic with no count falls back to score", "metacritic", 8.5, 0, "metacritic-award-deepgold"},
		{"rt with no count falls back to score", "rt", 9.0, 0, "critics-certified-fresh"},

		// Non-award tiers never depended on the count and must not start to.
		{"plain tomato ignores the count", "rt", 7.0, 3, "critics-fresh"},
		{"splat ignores the count", "rt", 3.0, 1, "critics-rotten"},
		{"audience ignores the count", "rtaudience", 9.0, 2, "audience-upright"},
	}
	for _, c := range cases {
		if got := markStateFor(provider.Rating{Source: c.source, Value: c.value, Votes: c.votes}, titleFacts{}); got != c.want {
			t.Errorf("%s: markStateFor(%s %.1f, %d votes, titleFacts{}) = %q, want %q",
				c.name, c.source, c.value, c.votes, got, c.want)
		}
	}
}
