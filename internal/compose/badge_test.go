package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func TestFormatVoteCount(t *testing.T) {
	for _, tc := range []struct {
		in   int
		want string
	}{
		{0, "0"},
		{7, "7"},
		{999, "999"},
		{1000, "1.0K"},
		{2500, "2.5K"},
		{9999, "10.0K"},
		{10_000, "10K"},
		{340_000, "340K"},
		{999_999, "999K"},
		{1_000_000, "1.0M"},
		{2_914_772, "2.9M"},
	} {
		if got := formatVoteCount(tc.in); got != tc.want {
			t.Errorf("formatVoteCount(%d) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// Only IMDb, MDBList and TMDB report a vote count. A badge for any other source
// must be left exactly as it was, not padded with a zero that would read as
// "nobody voted".
func TestVoteCountIsOmittedWhenTheSourceHasNone(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingVoteCounts = true

	withCount := provider.Rating{Source: "imdb", Value: 8.7, Votes: 2_914_772, Label: "8.7"}
	if got, want := ratingBadgeLabel(withCount, cfg), "8.7 2.9M"; got != want {
		t.Errorf("with votes: got %q, want %q", got, want)
	}

	noCount := provider.Rating{Source: "rt", Value: 9.1, Votes: 0, Label: "91%"}
	if got := ratingBadgeLabel(noCount, cfg); got != "91%" {
		t.Errorf("without votes: got %q, want the bare value", got)
	}
}

func TestVoteCountIsOffByDefault(t *testing.T) {
	cfg := imageconfig.Default()
	r := provider.Rating{Source: "imdb", Value: 8.7, Votes: 2_914_772, Label: "8.7"}
	if got := ratingBadgeLabel(r, cfg); got != "8.7" {
		t.Errorf("got %q, want the value alone when counts are off", got)
	}
}

// The label changes pixels, so the toggle has to reach the cache key.
func TestVoteCountsAreInTheCacheKey(t *testing.T) {
	off := imageconfig.Default()
	on := off
	on.RatingVoteCounts = true
	if imageconfig.CacheKey(off) == imageconfig.CacheKey(on) {
		t.Error("enabling vote counts did not change the cache key")
	}
}
