package provider

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func waitForRank(t *testing.T, idx *TrendingRankIndex, kind, id string) (int, bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		r, ok := idx.Rank(context.Background(), kind, id)
		if ok || time.Now().After(deadline) {
			return r, ok
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// FR-226: films not yet out on digital are skipped, and the titles below move up.
func TestTrendingRanksSkipFilmsNotOutOnDigital(t *testing.T) {
	idx := &TrendingRankIndex{now: time.Now, ranks: map[string]int{}}
	idx.list = func(_ context.Context, page int) ([]tmdbListItem, error) {
		if page > 1 {
			return nil, nil
		}
		return []tmdbListItem{
			{ID: 1, MediaType: "movie"}, // in cinemas only
			{ID: 2, MediaType: "tv"},
			{ID: 3, MediaType: "person"},
			{ID: 4, MediaType: "movie"},
			{ID: 5, MediaType: "movie"}, // its dates could not be read
		}, nil
	}
	idx.digital = func(_ context.Context, id int) (bool, error) {
		if id == 5 {
			return false, errors.New("timeout")
		}
		return id != 1, nil
	}

	if r, ok := waitForRank(t, idx, "tv", "tmdb:tv:2"); !ok || r != 1 {
		t.Errorf("series 2: rank %d ok %v, want 1", r, ok)
	}
	if r, ok := idx.Rank(context.Background(), "movie", "tmdb:movie:4"); !ok || r != 2 {
		t.Errorf("film 4: rank %d ok %v, want 2", r, ok)
	}
	for _, id := range []string{"1", "3", "5", "999"} {
		if r, ok := idx.Rank(context.Background(), "movie", id); ok {
			t.Errorf("film %s ranked %d, want unranked", id, r)
		}
	}
	// TMDB numbers films and series separately: series 2 trending says nothing of film 2.
	if r, ok := idx.Rank(context.Background(), "movie", "2"); ok {
		t.Errorf("film 2 ranked %d from series 2", r)
	}
}

// A new UTC day refreshes the list once; a failed refresh keeps the last list
// and is not retried until its back-off has passed.
func TestTrendingRanksRefreshOncePerDayAndBackOffAfterFailure(t *testing.T) {
	var mu sync.Mutex
	now := time.Date(2026, 10, 13, 23, 0, 0, 0, time.UTC)
	calls, fail := 0, false
	clock := func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	idx := &TrendingRankIndex{now: clock, ranks: map[string]int{}}
	idx.digital = func(context.Context, int) (bool, error) { return true, nil }
	idx.list = func(_ context.Context, page int) ([]tmdbListItem, error) {
		if page > 1 {
			return nil, nil
		}
		mu.Lock()
		defer mu.Unlock()
		calls++
		if fail {
			return nil, errors.New("tmdb down")
		}
		return []tmdbListItem{{ID: 7, MediaType: "tv"}}, nil
	}
	settle := func() { time.Sleep(50 * time.Millisecond) }
	count := func() int { mu.Lock(); defer mu.Unlock(); return calls }

	if _, ok := waitForRank(t, idx, "tv", "7"); !ok {
		t.Fatal("first day never ranked")
	}
	if idx.Day() != "2026-10-13" {
		t.Errorf("day = %q, want the list's own day", idx.Day())
	}
	idx.Rank(context.Background(), "tv", "7")
	settle()
	if count() != 1 {
		t.Fatalf("list fetched %d times in one day, want 1", count())
	}

	mu.Lock()
	now, fail = now.Add(2*time.Hour), true
	mu.Unlock()
	for i := 0; i < 5; i++ {
		idx.Rank(context.Background(), "tv", "7")
		settle()
	}
	if count() != 2 {
		t.Errorf("a failed refresh was tried %d times in a row, want once until the back-off passes", count()-1)
	}
	if r, ok := idx.Rank(context.Background(), "tv", "7"); !ok || r != 1 || idx.Day() != "2026-10-13" {
		t.Errorf("after a failed refresh rank %d ok %v day %q, want the last list kept", r, ok, idx.Day())
	}

	mu.Lock()
	now, fail = now.Add(trendingRankRetry), false
	mu.Unlock()
	idx.Rank(context.Background(), "tv", "7")
	settle()
	if count() != 3 || idx.Day() != "2026-10-14" {
		t.Errorf("after the back-off: %d fetches, day %q; want a retry that lands the new day", count(), idx.Day())
	}
}
