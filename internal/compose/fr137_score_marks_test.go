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
		got := markStateFor(provider.Rating{Source: c.source, Value: c.value})
		if got != c.want {
			t.Errorf("markStateFor(%s @ %.1f) = %q, want %q", c.source, c.value, got, c.want)
		}
	}
}

// The score-dependence has to reach the drawn mark, not just the name: a fresh
// score and a rotten score must resolve to different images. A fixed-per-source
// lookup returns the same mark for both and fails here.
func TestRatingMarkDiffersByScore(t *testing.T) {
	ensureIcons()
	fresh := ratingMark(provider.Rating{Source: "rt", Value: 9.0})
	rotten := ratingMark(provider.Rating{Source: "rt", Value: 3.0})
	if fresh == nil || rotten == nil {
		t.Fatal("RT marks did not load")
	}
	if fresh == rotten {
		t.Error("a fresh and a rotten RT score resolved to the same mark")
	}
	award := ratingMark(provider.Rating{Source: "metacritic", Value: 8.5})
	plain := ratingMark(provider.Rating{Source: "metacritic", Value: 7.0})
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
		if !ratingMarkColored(r) {
			t.Errorf("%s @ %.1f would be tinted with the accent instead of drawn in colour", r.Source, r.Value)
		}
	}
}
