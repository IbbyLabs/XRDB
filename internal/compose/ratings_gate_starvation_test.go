package compose

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// lastFetchedRated models a source whose rated titles have all been served from
// the cache for an hour, so its newest fetched rating is that old.
func lastFetchedRated(ago time.Duration) func(string, string, time.Duration) bool {
	return func(_, _ string, within time.Duration) bool { return within > ago }
}

func TestCacheServedRatingsDoNotStarveTheWikidataAbsenceGate(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	c.answering = lastFetchedRated(time.Hour)

	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return noRatings(), true, nil
	}
	key := ratingsKey("wikidata", "movie", "tt31840873")
	for i := 0; i < 5; i++ {
		mustDo(t, c, key, titleAge{}, fetch)
	}
	if calls.Load() != 1 {
		t.Errorf("wikidata was asked %d times for one absence, want 1", calls.Load())
	}
}

func TestAScrapedSourceStillNeedsARecentRatingToRememberAnAbsence(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	c.answering = lastFetchedRated(time.Hour)

	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return noRatings(), true, nil
	}
	key := ratingsKey("letterboxd", "movie", "tt1")
	for i := 0; i < 3; i++ {
		mustDo(t, c, key, titleAge{}, fetch)
	}
	if calls.Load() != 3 {
		t.Errorf("an absence was remembered from a source with no rating for an hour: %d fetches, want 3", calls.Load())
	}
}

func TestTheWikidataWindowOutlastsItsObservedRatedFetchGap(t *testing.T) {
	// 29 fetched rated answers in about 7 hours on 24 Oct 2026.
	gap := 7 * time.Hour / 29
	if w := ratingsAnswerFreshness("wikidata"); w < 10*gap {
		t.Errorf("wikidata freshness %v is under ten observed gaps (%v)", w, 10*gap)
	}
}
