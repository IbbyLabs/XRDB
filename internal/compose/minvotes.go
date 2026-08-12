package compose

import (
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// defaultMinVotes is the vote count below which a source's rating is treated as
// too thin to show. Each sits about an order of magnitude below what a mid-tier
// title carries on that source, measured against IMDb's ratings dataset.
var defaultMinVotes = map[string]int{
	"imdb":           100,
	"letterboxd":     100,
	"metacriticuser": 50,
	"trakt":          20,
	"tmdb":           20,
	"simkl":          20,
}

// minVotesExempt names sources whose count does not measure agreement, so no
// threshold on it means anything. Metacritic and Rotten Tomatoes count
// reviewing publications, which is bounded and grows with the year rather than
// with confidence. Popcorn's count is unreliable per title: Citizen Kane
// reports 13, the same as a film nobody has heard of.
var minVotesExempt = map[string]bool{
	"metacritic": true,
	"tomatoes":   true,
	"popcorn":    true,
}

// minVotesFor returns the threshold for a source and whether one applies.
func minVotesFor(source string, cfg imageconfig.Config) (int, bool) {
	// Checked before the override: a threshold on these sources is incoherent
	// however it is set, and one nudged to 20 would delete Citizen Kane.
	if minVotesExempt[source] {
		return 0, false
	}
	if n, ok := cfg.RatingMinVotesBySource[source]; ok {
		return n, n > 0
	}
	n, ok := defaultMinVotes[source]
	return n, ok
}

// splitThinRatings separates ratings backed by too few votes to mean anything.
// A source with no count reported is unknown rather than thin and is kept, or
// the six sources that carry no count would vanish from every poster.
func splitThinRatings(ratings []provider.Rating, cfg imageconfig.Config) (kept []provider.Rating, thin []string) {
	if !cfg.RatingMinVotes {
		return ratings, nil
	}
	kept = make([]provider.Rating, 0, len(ratings))
	for _, r := range ratings {
		min, applies := minVotesFor(r.Source, cfg)
		if applies && r.Votes > 0 && r.Votes < min {
			thin = append(thin, r.Source)
			continue
		}
		kept = append(kept, r)
	}
	return kept, thin
}
