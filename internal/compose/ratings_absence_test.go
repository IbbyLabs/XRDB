package compose

import (
	"context"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

func noRatings() *provider.MediaMeta { return &provider.MediaMeta{} }

// Most titles genuinely have no score on most sources, and re-asking for each
// absence on every render is what fills the pacing queue.
func TestAnAbsenceIsRememberedWhileTheSourceIsWorking(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	c.answering = func(string, string, time.Duration) bool { return true }

	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return noRatings(), true, nil
	}
	for i := 0; i < 5; i++ {
		if _, err := c.do(context.Background(), provider.GoodKey("wikidata", "poster", "tt1"), 0, fetch); err != nil {
			t.Fatal(err)
		}
	}
	if calls.Load() != 1 {
		t.Errorf("the source was asked %d times for one absence, want 1", calls.Load())
	}
}

// A source answering empty for everything is a broken scrape, and remembering
// that would pin its outage for the term.
func TestAnAbsenceIsNotRememberedFromASourceThatIsNotAnswering(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	c.answering = func(string, string, time.Duration) bool { return false }

	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return noRatings(), true, nil
	}
	for i := 0; i < 3; i++ {
		if _, err := c.do(context.Background(), provider.GoodKey("wikidata", "poster", "tt1"), 0, fetch); err != nil {
			t.Fatal(err)
		}
	}
	if calls.Load() != 3 {
		t.Errorf("an absence from a silent source was remembered: %d fetches, want 3", calls.Load())
	}
}

// The exposure after a scrape breaks is how long it takes to notice, not the
// term the entry was written for.
func TestARememberedAbsenceStopsBeingServedWhenTheSourceGoesQuiet(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	working := true
	c.answering = func(string, string, time.Duration) bool { return working }

	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return noRatings(), true, nil
	}
	key := provider.GoodKey("wikidata", "poster", "tt1")
	c.do(context.Background(), key, 0, fetch)
	c.do(context.Background(), key, 0, fetch)
	if calls.Load() != 1 {
		t.Fatalf("setup: the absence was not remembered, %d fetches", calls.Load())
	}

	working = false
	c.do(context.Background(), key, 0, fetch)

	if calls.Load() != 2 {
		t.Error("a remembered absence was still served after the source went quiet")
	}
}

// An answer carrying ratings is a fact about the title and does not depend on
// the source still being well.
func TestARememberedRatingIsServedRegardlessOfSourceHealth(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	c.answering = func(string, string, time.Duration) bool { return false }

	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return oneRating("wikidata"), true, nil
	}
	key := provider.GoodKey("wikidata", "poster", "tt1")
	c.do(context.Background(), key, 0, fetch)
	c.do(context.Background(), key, 0, fetch)

	if calls.Load() != 1 {
		t.Errorf("a remembered rating was re-fetched: %d calls, want 1", calls.Load())
	}
}

// The age rule would give the newest titles the longest term, and absences skew
// towards new titles.
func TestAnAbsenceTakesItsOwnTermRatherThanTheAgeScaledOne(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	c.answering = func(string, string, time.Duration) bool { return true }

	key := provider.GoodKey("wikidata", "poster", "tt1")
	c.do(context.Background(), key, 1950, func(context.Context) (*provider.MediaMeta, bool, error) {
		return noRatings(), true, nil
	})

	c.mu.Lock()
	got := c.entries[key].TTL
	c.mu.Unlock()
	if got != AbsentRatingsCacheTTL {
		t.Errorf("TTL = %v, want the absence term %v", got, AbsentRatingsCacheTTL)
	}
}

// Health starts empty after a restart, so a loaded absence could never be
// believed on arrival.
func TestAbsencesAreNotPersisted(t *testing.T) {
	dir := t.TempDir()
	c := newRatingsCache(time.Hour, nil)
	c.path = dir + "/ratings.json"
	c.answering = func(string, string, time.Duration) bool { return true }

	absent := provider.GoodKey("wikidata", "poster", "tt1")
	rated := provider.GoodKey("wikidata", "poster", "tt2")
	c.do(context.Background(), absent, 0, func(context.Context) (*provider.MediaMeta, bool, error) {
		return noRatings(), true, nil
	})
	c.do(context.Background(), rated, 0, func(context.Context) (*provider.MediaMeta, bool, error) {
		return oneRating("wikidata"), true, nil
	})
	if err := c.Save(); err != nil {
		t.Fatal(err)
	}

	reloaded := newRatingsCache(time.Hour, nil)
	reloaded.path = c.path
	reloaded.load(slog.Default())

	reloaded.mu.Lock()
	defer reloaded.mu.Unlock()
	if _, ok := reloaded.entries[absent]; ok {
		t.Error("an absence survived the restart")
	}
	if _, ok := reloaded.entries[rated]; !ok {
		t.Error("control: the rated answer did not survive, so the test proves nothing")
	}
}
