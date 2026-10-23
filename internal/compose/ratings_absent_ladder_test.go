package compose

import (
	"context"
	"strconv"
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

func TestAStreakSurvivesItsEntryBeingEvicted(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	c.answering = func(string, string, time.Duration) bool { return true }
	key := provider.GoodKey("wikidata", "poster", "tt1")
	mustDo(t, c, key, titleAge{}, absentFetch)
	c.mu.Lock()
	delete(c.entries, key)
	c.mu.Unlock()
	mustDo(t, c, key, titleAge{}, absentFetch)
	if got := heldFor(c, key); got != 6*time.Hour {
		t.Errorf("the second absence after eviction held %s, want 6h", got)
	}
}

func TestAStreakSurvivesARestart(t *testing.T) {
	path := t.TempDir() + "/ratings.json"
	key := provider.GoodKey("wikidata", "poster", "tt1")

	c := newRatingsCache(24*time.Hour, nil)
	c.path = path
	c.answering = func(string, string, time.Duration) bool { return true }
	mustDo(t, c, key, titleAge{}, absentFetch)
	expire(c, key)
	mustDo(t, c, key, titleAge{}, absentFetch)
	if err := c.Save(); err != nil {
		t.Fatal(err)
	}

	restarted := newRatingsCache(24*time.Hour, nil)
	restarted.path = path
	restarted.answering = func(string, string, time.Duration) bool { return true }
	restarted.load(nil)
	expire(restarted, key)
	mustDo(t, restarted, key, titleAge{}, absentFetch)
	if got := heldFor(restarted, key); got != 24*time.Hour {
		t.Errorf("the third absence after a restart held %s, want 24h", got)
	}
}

func TestAStreakIsForgottenAfterItsMemory(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	c.answering = func(string, string, time.Duration) bool { return true }
	key := provider.GoodKey("wikidata", "poster", "tt1")
	mustDo(t, c, key, titleAge{}, absentFetch)
	expire(c, key)
	c.mu.Lock()
	c.streaks[key] = absentStreak{N: 3, At: time.Now().Add(-absentStreakMemory - time.Hour)}
	c.mu.Unlock()
	mustDo(t, c, key, titleAge{}, absentFetch)
	if got := heldFor(c, key); got != AbsentRatingsCacheTTL {
		t.Errorf("an absence after a forgotten streak held %s, want %s", got, AbsentRatingsCacheTTL)
	}
}

func TestStreakRecordsStopAtTheirBound(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	c.answering = func(string, string, time.Duration) bool { return true }
	c.mu.Lock()
	for i := 0; i < absentStreakMax; i++ {
		c.streaks[provider.GoodKey("wikidata", "poster", "tt"+itoa(i))] = absentStreak{N: 0, At: time.Now()}
	}
	stale := provider.GoodKey("wikidata", "poster", "tt0")
	c.streaks[stale] = absentStreak{N: 0, At: time.Now().Add(-absentStreakMemory - time.Hour)}
	c.mu.Unlock()

	fresh := provider.GoodKey("wikidata", "poster", "tt-new")
	mustDo(t, c, fresh, titleAge{}, absentFetch)
	c.mu.Lock()
	_, recorded := c.streaks[fresh]
	_, staleKept := c.streaks[stale]
	n := len(c.streaks)
	c.mu.Unlock()
	if !recorded || staleKept {
		t.Errorf("recorded=%v staleKept=%v, want the stale record swept to make room", recorded, staleKept)
	}
	if n > absentStreakMax {
		t.Errorf("%d streak records, bound is %d", n, absentStreakMax)
	}

	other := provider.GoodKey("wikidata", "poster", "tt-other")
	mustDo(t, c, other, titleAge{}, absentFetch)
	c.mu.Lock()
	_, recorded = c.streaks[other]
	c.mu.Unlock()
	if recorded {
		t.Error("a full map of fresh records took another one")
	}
}

func itoa(i int) string { return strconv.Itoa(i) }
