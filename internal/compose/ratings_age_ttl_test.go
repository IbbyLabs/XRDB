package compose

import (
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

func TestTheTermGrowsWithTheTitlesAge(t *testing.T) {
	base := 24 * time.Hour
	thisYear := time.Now().Year()

	for _, tc := range []struct {
		name string
		year int
		want time.Duration
	}{
		{name: "out this year", year: thisYear, want: base},
		{name: "out last year", year: thisYear - 1, want: 2 * base},
		{name: "two years old", year: thisYear - 2, want: 2 * base},
		{name: "three years old", year: thisYear - 3, want: 3 * base},
		{name: "a decade old", year: thisYear - 10, want: 3 * base},
		{name: "no year at all", year: 0, want: base},
		{name: "dated in the future", year: thisYear + 2, want: base},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := ageScaledTTL(base, tc.year)
			if got != tc.want {
				t.Errorf("ttl = %s, want %s", got, tc.want)
			}
		})
	}
}

// An answer is thin when a source dropped out of it, which happens when an
// allowance runs dry rather than because of anything about the title. Letting
// the age rule win would pin a degraded answer for days on exactly the
// instances that spend their allowance, and they are the least able to see it.
func TestAThinAnswerAboutAnOldTitleIsStillReAskedSoon(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	old := &provider.MediaMeta{
		Year:    time.Now().Year() - 20,
		Ratings: []provider.Rating{{Source: "imdb", Value: 8}},
	}

	c.mu.Lock()
	c.storeLocked("k", old, false, 0)
	c.mu.Unlock()

	c.mu.Lock()
	life := time.Until(c.entries["k"].ExpiresAt)
	c.mu.Unlock()

	if life > PartialRatingsCacheTTL {
		t.Errorf("a thin answer was kept for %s, want no more than %s", life, PartialRatingsCacheTTL)
	}
}

func TestAFullAnswerAboutAnOldTitleTakesTheLongerTerm(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	old := &provider.MediaMeta{
		Year:    time.Now().Year() - 20,
		Ratings: []provider.Rating{{Source: "imdb", Value: 8}},
	}

	c.mu.Lock()
	c.storeLocked("k", old, true, 0)
	life := time.Until(c.entries["k"].ExpiresAt)
	c.mu.Unlock()

	if life <= 48*time.Hour {
		t.Errorf("a complete answer about a 20-year-old title was kept %s, want the 3x term", life)
	}
}

func TestTheTitlesYearScalesATermTheAnswerCannotDate(t *testing.T) {
	base := 24 * time.Hour
	old := time.Now().Year() - 10
	c := newRatingsCache(base, nil)

	// A rating source that reports no year of its own, which is most of them.
	answer := &provider.MediaMeta{Ratings: []provider.Rating{{Source: "wikidata", Value: 7}}}

	c.mu.Lock()
	c.storeLocked("wikidata|movie|tt1", answer, true, old)
	c.storeLocked("wikidata|movie|tt2", answer, true, 0)
	withYear, withNone := c.entries["wikidata|movie|tt1"].TTL, c.entries["wikidata|movie|tt2"].TTL
	c.mu.Unlock()

	if withYear != 3*base {
		t.Errorf("term with the title's year = %s, want %s", withYear, 3*base)
	}
	if withNone != base {
		t.Errorf("term with no year = %s, want %s", withNone, base)
	}
}

func TestTheAnswersOwnYearStillCountsWhenTheTitleHasNone(t *testing.T) {
	base := 24 * time.Hour
	c := newRatingsCache(base, nil)
	answer := &provider.MediaMeta{
		Year:    time.Now().Year() - 10,
		Ratings: []provider.Rating{{Source: "tmdb", Value: 7}},
	}

	c.mu.Lock()
	c.storeLocked("tmdb|movie|tt1", answer, true, 0)
	got := c.entries["tmdb|movie|tt1"].TTL
	c.mu.Unlock()

	if got != 3*base {
		t.Errorf("term = %s, want %s", got, 3*base)
	}
}
