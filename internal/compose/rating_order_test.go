package compose

import (
	"testing"

	"xrdb_rewrite/internal/provider"
)

func sources(ratings []provider.Rating) []string {
	out := make([]string, len(ratings))
	for i, r := range ratings {
		out[i] = r.Source
	}
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// Providers are called in parallel and appended as they answer, so the fetched
// order is arbitrary. The strip follows the configured order instead.
func TestFilterRatingsFollowsConfiguredOrder(t *testing.T) {
	fetched := []provider.Rating{
		{Source: "rt", Value: 9.4},
		{Source: "imdb", Value: 8.3},
		{Source: "tmdb", Value: 8.2},
	}
	want := []string{"imdb", "tmdb", "rt"}
	if got := sources(filterRatings(fetched, want)); !equalStrings(got, want) {
		t.Errorf("order = %v, want %v", got, want)
	}

	// Reversing the arrival order must not move the badges.
	reversed := []provider.Rating{fetched[2], fetched[1], fetched[0]}
	if got := sources(filterRatings(reversed, want)); !equalStrings(got, want) {
		t.Errorf("arrival order changed the strip: %v, want %v", got, want)
	}
}

func TestFilterRatingsDropsSourcesWithNoValue(t *testing.T) {
	fetched := []provider.Rating{{Source: "imdb", Value: 8.3}}
	got := sources(filterRatings(fetched, []string{"mal", "imdb", "kitsu"}))
	if !equalStrings(got, []string{"imdb"}) {
		t.Errorf("got %v, want [imdb]", got)
	}
}

// Ordering the anime sources ahead of the general ones and capping the count
// shows the anime scores on anime and falls through to the general scores on
// everything else.
func TestConfiguredOrderWithCapFallsThroughToGeneralSources(t *testing.T) {
	order := []string{"mal", "kitsu", "anilist", "tmdb", "imdb", "rt"}
	const max = 3

	take := func(fetched []provider.Rating) []string {
		f := filterRatings(fetched, order)
		if len(f) > max {
			f = f[:max]
		}
		return sources(f)
	}

	anime := []provider.Rating{
		{Source: "imdb", Value: 8.1},
		{Source: "anilist", Value: 9.0},
		{Source: "tmdb", Value: 8.4},
		{Source: "mal", Value: 9.1},
		{Source: "kitsu", Value: 8.9},
	}
	if got := take(anime); !equalStrings(got, []string{"mal", "kitsu", "anilist"}) {
		t.Errorf("anime = %v, want [mal kitsu anilist]", got)
	}

	movie := []provider.Rating{
		{Source: "rt", Value: 9.4},
		{Source: "imdb", Value: 8.3},
		{Source: "tmdb", Value: 8.2},
	}
	if got := take(movie); !equalStrings(got, []string{"tmdb", "imdb", "rt"}) {
		t.Errorf("movie = %v, want [tmdb imdb rt]", got)
	}
}
