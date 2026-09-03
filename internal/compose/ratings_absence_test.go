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

// mustDo runs a cache lookup and fails the test if it errors, so a call made for
// its side effect still checks its error.
func mustDo(t *testing.T, c *ratingsCache, key string, year int, fetch ratingsFetch) {
	t.Helper()
	if _, err := c.do(context.Background(), key, year, fetch); err != nil {
		t.Fatalf("cache lookup for %s: %v", key, err)
	}
}

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
	mustDo(t, c, key, 0, fetch)
	mustDo(t, c, key, 0, fetch)
	if calls.Load() != 1 {
		t.Fatalf("setup: the absence was not remembered, %d fetches", calls.Load())
	}

	working = false
	mustDo(t, c, key, 0, fetch)

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
	mustDo(t, c, key, 0, fetch)
	mustDo(t, c, key, 0, fetch)

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
	mustDo(t, c, key, 1950, func(context.Context) (*provider.MediaMeta, bool, error) {
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
	mustDo(t, c, absent, 0, func(context.Context) (*provider.MediaMeta, bool, error) {
		return noRatings(), true, nil
	})
	mustDo(t, c, rated, 0, func(context.Context) (*provider.MediaMeta, bool, error) {
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

// Health records what a source did. A served absence is a render rather than an
// answer, so it must not move a counter that reads as evidence about the source.
func TestAServedAbsenceIsNotCountedAsTheSourceAnsweringEmpty(t *testing.T) {
	h := provider.NewHealthTracker(10, time.Hour)
	// A real answer first, so the absence is storable at all.
	h.Success("wikidata", provider.GoodKey("wikidata", "", "tt1"),
		&provider.MediaMeta{Ratings: []provider.Rating{{Source: "wikidata", Value: 7}}})

	prov := &provider.StubProvider{ProviderName: "wikidata", Meta: noRatings()}
	p := &Pipeline{providers: testRegistry(prov), fetcher: &stubImageFetcher{}, health: h}
	p.ratings = newRatingsCache(time.Hour, nil)
	p.wireRatingsHealth()

	req := Request{MediaType: "poster", MediaID: "tt2"}
	for i := 0; i < 4; i++ {
		if _, _, err := p.fetchRatingsResilient(context.Background(), prov, req,
			&provider.MediaMeta{}); err != nil {
			t.Fatalf("render %d: %v", i, err)
		}
	}

	if got := prov.Calls; got != 1 {
		t.Fatalf("setup: the source was asked %d times, want 1", got)
	}
	for _, sh := range h.Snapshot() {
		if sh.Source == "wikidata" && sh.ConsecutiveEmpty != 1 {
			t.Errorf("ConsecutiveEmpty = %d after one fetch and three cache hits, want 1",
				sh.ConsecutiveEmpty)
		}
	}
}
