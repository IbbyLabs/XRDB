package provider

import (
	"context"
	"errors"
	"testing"
	"time"
)

func waitForRank(t *testing.T, idx *TrendingRankIndex, id string) (int, bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		r, ok := idx.Rank(context.Background(), id)
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

	if r, ok := waitForRank(t, idx, "tmdb:tv:2"); !ok || r != 1 {
		t.Errorf("series 2: rank %d ok %v, want 1", r, ok)
	}
	if r, ok := idx.Rank(context.Background(), "tmdb:movie:4"); !ok || r != 2 {
		t.Errorf("film 4: rank %d ok %v, want 2", r, ok)
	}
	for _, id := range []string{"1", "3", "5", "999"} {
		if r, ok := idx.Rank(context.Background(), id); ok {
			t.Errorf("%s ranked %d, want unranked", id, r)
		}
	}
}

// A new UTC day refreshes the list once; a failed refresh keeps the last one.
func TestTrendingRanksRefreshOncePerDayAndKeepTheLastOnFailure(t *testing.T) {
	now := time.Date(2026, 10, 13, 23, 0, 0, 0, time.UTC)
	calls, fail := 0, false
	idx := &TrendingRankIndex{now: func() time.Time { return now }, ranks: map[string]int{}}
	idx.digital = func(context.Context, int) (bool, error) { return true, nil }
	idx.list = func(_ context.Context, page int) ([]tmdbListItem, error) {
		if page > 1 {
			return nil, nil
		}
		calls++
		if fail {
			return nil, errors.New("tmdb down")
		}
		return []tmdbListItem{{ID: 7, MediaType: "tv"}}, nil
	}
	if _, ok := waitForRank(t, idx, "7"); !ok {
		t.Fatal("first day never ranked")
	}
	idx.Rank(context.Background(), "7")
	if calls != 1 {
		t.Errorf("list fetched %d times in one day, want 1", calls)
	}
	now, fail = now.Add(2*time.Hour), true
	idx.Rank(context.Background(), "7")
	time.Sleep(100 * time.Millisecond)
	if r, ok := idx.Rank(context.Background(), "7"); !ok || r != 1 {
		t.Errorf("after a failed refresh rank %d ok %v, want the last list kept", r, ok)
	}
}
