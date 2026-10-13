package provider

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"sync"
	"time"
)

// trendingRankDepth is how far down TMDB's daily list ranks are read.
const trendingRankDepth = 100

// TrendingRankIndex gives a title's place in today's TMDB trending list. Films
// not yet out on digital are skipped and the titles below them move up.
type TrendingRankIndex struct {
	now func() time.Time
	// digital reports whether a film is out on digital.
	digital func(ctx context.Context, id int) (bool, error)
	// list pages the daily list.
	list func(ctx context.Context, page int) ([]tmdbListItem, error)

	mu         sync.RWMutex
	day        string
	ranks      map[string]int
	refreshing bool
}

// NewTrendingRankIndex builds the index. A nil TMDB client ranks nothing.
func NewTrendingRankIndex(tmdb *TMDB) *TrendingRankIndex {
	t := &TrendingRankIndex{now: time.Now, ranks: map[string]int{}}
	if tmdb != nil {
		t.list = func(ctx context.Context, page int) ([]tmdbListItem, error) { return dailyTrendingPage(ctx, tmdb, page) }
		t.digital = func(ctx context.Context, id int) (bool, error) { return outOnDigital(ctx, tmdb, id, t.now()) }
	}
	return t
}

// TrendingDay is the UTC date ranks are read for.
func TrendingDay(now time.Time) string { return now.UTC().Format("2006-01-02") }

// Rank returns the title's place, 1 first, for any of the ids held for it. A new
// day's list is fetched in the background; until it lands the last one answers.
func (t *TrendingRankIndex) Rank(ctx context.Context, ids ...string) (int, bool) {
	if t == nil || t.list == nil {
		return 0, false
	}
	today := TrendingDay(t.now())
	t.mu.Lock()
	if t.day != today && !t.refreshing {
		t.refreshing = true
		go t.refresh(context.WithoutCancel(ctx), today)
	}
	t.mu.Unlock()
	t.mu.RLock()
	defer t.mu.RUnlock()
	for _, id := range ids {
		if key := normalizeTrendingKey(id); key != "" {
			if r, ok := t.ranks[key]; ok {
				return r, true
			}
		}
	}
	return 0, false
}

func (t *TrendingRankIndex) refresh(ctx context.Context, day string) {
	ranks, err := t.fetch(ctx)
	t.mu.Lock()
	defer t.mu.Unlock()
	t.refreshing = false
	if err != nil {
		slog.WarnContext(ctx, "Could not refresh today's trending ranks, so the last list stays", "error", err)
		return
	}
	t.day, t.ranks = day, ranks
	slog.InfoContext(ctx, "Refreshed today's trending ranks", "day", day, "ranked", len(ranks))
}

func (t *TrendingRankIndex) fetch(ctx context.Context) (map[string]int, error) {
	ranks := make(map[string]int, trendingRankDepth)
	rank := 0
	for page := 1; rank < trendingRankDepth && page <= maxTrendingPages; page++ {
		items, err := t.list(ctx, page)
		if err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}
		if len(items) == 0 {
			break
		}
		for _, it := range items {
			if rank >= trendingRankDepth {
				break
			}
			switch it.MediaType {
			case "tv":
			case "movie":
				out, err := t.digital(ctx, it.ID)
				if err != nil {
					slog.WarnContext(ctx, "Could not read a trending film's release dates, so it is left unranked",
						"tmdb_id", it.ID, "error", err)
					continue
				}
				if !out {
					continue
				}
			default:
				continue
			}
			rank++
			ranks[strconv.Itoa(it.ID)] = rank
		}
	}
	return ranks, nil
}

func dailyTrendingPage(ctx context.Context, tmdb *TMDB, page int) ([]tmdbListItem, error) {
	var result struct {
		Results []tmdbListItem `json:"results"`
	}
	if err := tmdb.get(ctx, fmt.Sprintf("%s/trending/all/day?page=%d", tmdb.base(), page), &result); err != nil {
		return nil, err
	}
	return result.Results, nil
}

// outOnDigital reports whether any region has a digital release that has happened.
func outOnDigital(ctx context.Context, tmdb *TMDB, id int, now time.Time) (bool, error) {
	var result struct {
		Results []struct {
			Dates []struct {
				Type        int    `json:"type"`
				ReleaseDate string `json:"release_date"`
			} `json:"release_dates"`
		} `json:"results"`
	}
	if err := tmdb.get(ctx, fmt.Sprintf("%s/movie/%d/release_dates", tmdb.base(), id), &result); err != nil {
		return false, err
	}
	var entries []releaseEntry
	for _, r := range result.Results {
		for _, d := range r.Dates {
			entries = append(entries, releaseEntry{kind: d.Type, date: d.ReleaseDate})
		}
	}
	return releaseLanded(entries, now, releaseTypeDigital), nil
}
