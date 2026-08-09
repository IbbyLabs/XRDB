package provider

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func sampleMeta(source string, value float64) *MediaMeta {
	return &MediaMeta{Ratings: []Rating{{Source: source, Value: value, Label: "x"}}}
}

func TestLastGoodSurvivesAFailure(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	key := GoodKey("rt", "movie", "tt1")

	h.Success("rt", key, sampleMeta("rt", 9.1))
	h.Failure("rt", errors.New("markup changed"), CallerInteractive)

	got, ok := h.LastGood("rt", key)
	if !ok {
		t.Fatal("expected the remembered result to survive a failure")
	}
	if len(got.Ratings) != 1 || got.Ratings[0].Value != 9.1 {
		t.Errorf("got %+v, want the previously stored rating", got.Ratings)
	}
}

// An empty result is exactly what a broken scrape returns, so it must not
// overwrite the good answer we still want to fall back to.
func TestEmptyResultDoesNotOverwriteTheGoodOne(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	key := GoodKey("letterboxd", "movie", "tt1")

	h.Success("letterboxd", key, sampleMeta("letterboxd", 8.2))
	h.Success("letterboxd", key, &MediaMeta{}) // the day the markup changes

	got, ok := h.LastGood("letterboxd", key)
	if !ok {
		t.Fatal("expected the earlier good result to still be held")
	}
	if len(got.Ratings) != 1 || got.Ratings[0].Value != 8.2 {
		t.Errorf("got %+v, want the pre-breakage rating", got.Ratings)
	}
}

func TestLastGoodExpires(t *testing.T) {
	h := NewHealthTracker(10, time.Millisecond)
	key := GoodKey("rt", "movie", "tt1")
	h.Success("rt", key, sampleMeta("rt", 9.1))

	time.Sleep(5 * time.Millisecond)
	if _, ok := h.LastGood("rt", key); ok {
		t.Error("expected the remembered result to expire")
	}
}

func TestLastGoodIsBounded(t *testing.T) {
	h := NewHealthTracker(3, time.Hour)
	for i := 0; i < 10; i++ {
		h.Success("rt", GoodKey("rt", "movie", fmt.Sprintf("tt%d", i)), sampleMeta("rt", float64(i)))
	}
	if got := h.RememberedResults(); got != 3 {
		t.Errorf("holding %d results, want the cap of 3", got)
	}
	// The cap must evict the oldest, not the newest.
	if _, ok := h.LastGood("rt", GoodKey("rt", "movie", "tt9")); !ok {
		t.Error("the most recent result should have been kept")
	}
	if _, ok := h.LastGood("rt", GoodKey("rt", "movie", "tt0")); ok {
		t.Error("the oldest result should have been evicted")
	}
}

// A title that simply is not on a source is not a health problem, and must not
// mark that source unhealthy.
func TestNotFoundIsNotAHealthFailure(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Success("mdblist", GoodKey("mdblist", "movie", "tt1"), sampleMeta("imdb", 7.0))
	h.Failure("mdblist", fmt.Errorf("mdblist: nope: %w", errNotFound), CallerInteractive)

	for _, s := range h.Snapshot() {
		if s.Source == "mdblist" && !s.Healthy {
			t.Error("a not-found marked the source unhealthy")
		}
	}
}

func TestFailureMarksUnhealthyAndSuccessRecovers(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("rt", HTTPFault("rt", 500), CallerInteractive)

	snap := h.Snapshot()
	if len(snap) != 1 || snap[0].Healthy {
		t.Fatalf("expected rt to be unhealthy, got %+v", snap)
	}
	if snap[0].ConsecutiveFail != 1 || !strings.Contains(snap[0].LastError, "http 500") {
		t.Errorf("got %+v", snap[0])
	}

	h.Success("rt", GoodKey("rt", "movie", "tt1"), sampleMeta("rt", 9.0))
	snap = h.Snapshot()
	if !snap[0].Healthy || snap[0].ConsecutiveFail != 0 {
		t.Errorf("expected recovery, got %+v", snap[0])
	}
}

func TestStaleServesAreCounted(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	key := GoodKey("rt", "movie", "tt1")
	h.Success("rt", key, sampleMeta("rt", 9.1))

	for i := 0; i < 3; i++ {
		if _, ok := h.LastGood("rt", key); !ok {
			t.Fatal("expected a remembered result")
		}
	}
	snap := h.Snapshot()
	if snap[0].StaleServes != 3 {
		t.Errorf("staleServes = %d, want 3", snap[0].StaleServes)
	}
}

// An operator scanning the admin payload should see broken sources first.
func TestSnapshotPutsUnhealthySourcesFirst(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Success("aaa", GoodKey("aaa", "movie", "tt1"), sampleMeta("aaa", 1))
	h.Success("bbb", GoodKey("bbb", "movie", "tt1"), sampleMeta("bbb", 1))
	h.Failure("zzz", HTTPFault("zzz", 503), CallerInteractive)

	snap := h.Snapshot()
	if len(snap) != 3 {
		t.Fatalf("got %d sources, want 3", len(snap))
	}
	if snap[0].Source != "zzz" || snap[0].Healthy {
		t.Errorf("expected the unhealthy source first, got %+v", snap[0])
	}
	if snap[1].Source != "aaa" || snap[2].Source != "bbb" {
		t.Errorf("healthy sources should be name-ordered, got %s then %s", snap[1].Source, snap[2].Source)
	}
}

func TestLongErrorsAreTruncated(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	long := ""
	for i := 0; i < 500; i++ {
		long += "x"
	}
	h.Failure("rt", fmt.Errorf("%s: %w", long, ErrSourceFault), CallerInteractive)
	if got := len(h.Snapshot()[0].LastError); got > 210 {
		t.Errorf("stored error is %d chars, expected it truncated", got)
	}
}

// A nil tracker is the "feature disabled" case and must never panic.
func TestNilTrackerIsSafe(t *testing.T) {
	var h *HealthTracker
	h.Success("rt", "k", sampleMeta("rt", 1))
	h.Failure("rt", errors.New("x"), CallerInteractive)
	if _, ok := h.LastGood("rt", "k"); ok {
		t.Error("a nil tracker should never report a remembered result")
	}
	if h.Snapshot() != nil || h.RememberedResults() != 0 {
		t.Error("a nil tracker should report nothing")
	}
}

func TestKeysAreScopedPerSourceAndTitle(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Success("rt", GoodKey("rt", "movie", "tt1"), sampleMeta("rt", 9.1))

	if _, ok := h.LastGood("rt", GoodKey("rt", "movie", "tt2")); ok {
		t.Error("a different title must not reuse another title's result")
	}
	if _, ok := h.LastGood("rt", GoodKey("rt", "series", "tt1")); ok {
		t.Error("a different content type must not reuse the movie result")
	}
	if _, ok := h.LastGood("metacritic", GoodKey("metacritic", "movie", "tt1")); ok {
		t.Error("a different source must not reuse another source's result")
	}
}

// A timeout answers nothing and carries no Retry-After, so the rate-limit branch
// never fires. Without a breaker on plain failures the source is called again on
// the very next render and every render pays the timeout.
func TestRepeatedPlainFailuresHoldTheSourceOut(t *testing.T) {
	h := NewHealthTracker(16, time.Hour)
	plain := timedOut()

	for i := 0; i < failureBreakerThreshold-1; i++ {
		h.Failure("mdblist", plain, CallerInteractive)
	}
	if h.CoolingOff("mdblist", CallerInteractive) {
		t.Fatalf("source held out after %d failures, want it still tried", failureBreakerThreshold-1)
	}

	h.Failure("mdblist", plain, CallerInteractive)
	if !h.CoolingOff("mdblist", CallerInteractive) {
		t.Errorf("source still being called after %d consecutive timeouts, want it held out", failureBreakerThreshold)
	}

	// A success clears it, so a source that comes back is used again.
	h.Success("mdblist", GoodKey("mdblist", "movie", "tt1"), &MediaMeta{Ratings: []Rating{{Source: "imdb", Value: 8}}})
	if h.CoolingOff("mdblist", CallerInteractive) {
		t.Error("source still held out after answering again")
	}
}

// A source that cannot serve the current demand should settle rather than be
// probed on every cooldown, so each hold that ends in more failures is longer
// than the last. One success puts it straight back to the short hold.
func TestBreakerHoldsLongerEachTimeItTripsAgain(t *testing.T) {
	h := NewHealthTracker(16, time.Hour)
	plain := timedOut()
	trip := func() time.Duration {
		for i := 0; i < failureBreakerThreshold; i++ {
			h.Failure("mdblist", plain, CallerInteractive)
		}
		h.mu.Lock()
		defer h.mu.Unlock()
		src := h.sources["mdblist"]
		if src == nil {
			t.Fatal("no health entry for mdblist: the failures did not count at all")
		}
		return time.Until(src.cooldownUntil[CallerInteractive]).Round(time.Second)
	}

	first := trip()
	if first < 29*time.Second || first > 31*time.Second {
		t.Fatalf("first hold = %s, want ~%s", first, failureCooldown)
	}
	// Clear the clock-based gate so the next trip is measured from now.
	h.mu.Lock()
	h.sources["mdblist"].cooldownUntil = [2]time.Time{}
	h.mu.Unlock()

	second := trip()
	if second <= first {
		t.Errorf("second hold = %s, want longer than the first (%s)", second, first)
	}

	h.Success("mdblist", GoodKey("mdblist", "movie", "tt1"), &MediaMeta{Ratings: []Rating{{Source: "imdb", Value: 8}}})
	h.mu.Lock()
	trips := h.sources["mdblist"].breakerTrips
	h.mu.Unlock()
	if trips != 0 {
		t.Errorf("breakerTrips = %d after a success, want 0 so a recovered source is picked up fast", trips)
	}
}

// A title this source cannot be asked about says nothing about whether the
// source is up. Recording it holds the source out for every other render, so a
// single tmdb-only id takes MDBList off every poster until the cooldown expires
// (BUG-214). Measured on production: about a third of hold-out events were this
// shape rather than a provider being unwell.
func TestAnUnusableIDIsNotAHealthFailure(t *testing.T) {
	cases := []struct {
		name string
		call func() error
	}{
		{"mdblist given a tmdb id", func() error {
			_, err := NewMDBList("k").Fetch(context.Background(), "movie", "tmdb:movie:1234945")
			return err
		}},
		{"omdb given a tmdb id", func() error {
			_, err := NewOMDB("k").Fetch(context.Background(), "tv", "tmdb:tv:135444")
			return err
		}},
		{"cinemeta given a tmdb id", func() error {
			_, err := NewCinemeta().Fetch(context.Background(), "tv", "tmdb:tv:135444")
			return err
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.call()
			if err == nil {
				t.Fatal("expected an error for an id this source cannot use")
			}
			h := NewHealthTracker(10, time.Hour)
			h.Failure("src", err, CallerInteractive)
			for _, s := range h.Snapshot() {
				if s.Source == "src" && !s.Healthy {
					t.Errorf("an unusable id marked the source unhealthy: %v", err)
				}
			}
		})
	}
}
