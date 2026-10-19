package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// expire ends an entry's term without removing it, as time passing would.
func expire(c *ratingsCache, key string) {
	c.mu.Lock()
	e := c.entries[key]
	e.ExpiresAt = time.Now().Add(-time.Second)
	c.entries[key] = e
	c.mu.Unlock()
}

func heldFor(c *ratingsCache, key string) time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.entries[key].TTL
}

func absentFetch(context.Context) (*provider.MediaMeta, bool, error) { return noRatings(), true, nil }

func climb(t *testing.T, source string, n int) []time.Duration {
	t.Helper()
	c := newRatingsCache(24*time.Hour, nil)
	c.answering = func(string, string, time.Duration) bool { return true }
	key := provider.GoodKey(source, "poster", "tt1")
	var got []time.Duration
	for i := 0; i < n; i++ {
		mustDo(t, c, key, titleAge{}, absentFetch)
		got = append(got, heldFor(c, key))
		expire(c, key)
	}
	return got
}

func TestWikidataAbsencesClimbTheWholeLadder(t *testing.T) {
	want := []time.Duration{30 * time.Minute, 6 * time.Hour, 24 * time.Hour, 7 * 24 * time.Hour, 7 * 24 * time.Hour}
	got := climb(t, "wikidata", len(want))
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("absence %d held %s, want %s", i+1, got[i], want[i])
		}
	}
}

func TestOtherSourcesStopTheLadderAtADay(t *testing.T) {
	want := []time.Duration{30 * time.Minute, 6 * time.Hour, 24 * time.Hour, 24 * time.Hour}
	got := climb(t, "mdblist", len(want))
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("absence %d held %s, want %s", i+1, got[i], want[i])
		}
	}
}

func TestARatingSendsTheNextAbsenceBackToTheBottom(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	c.answering = func(string, string, time.Duration) bool { return true }
	key := provider.GoodKey("wikidata", "poster", "tt1")
	mustDo(t, c, key, titleAge{}, absentFetch)
	expire(c, key)
	mustDo(t, c, key, titleAge{}, absentFetch)
	expire(c, key)
	mustDo(t, c, key, titleAge{}, func(context.Context) (*provider.MediaMeta, bool, error) {
		return oneRating("wikidata"), true, nil
	})
	expire(c, key)
	mustDo(t, c, key, titleAge{}, absentFetch)
	if got := heldFor(c, key); got != AbsentRatingsCacheTTL {
		t.Errorf("an absence after a rating held %s, want %s", got, AbsentRatingsCacheTTL)
	}
}
