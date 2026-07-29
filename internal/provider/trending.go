package provider

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"time"
)

// TrendingIndex reports whether a title is in TMDB's current trending list.
// One list covers every title, so lookups need no per-title request.
type TrendingIndex struct {
	tmdb   *TMDB
	window string // day | week
	depth  int    // how many titles to keep
	ttl    time.Duration

	mu        sync.RWMutex
	ids       map[string]bool
	refreshed time.Time
	// failed marks the last refresh as unsuccessful; lookups then report false.
	failed bool
}

// TrendingOptions configures the index. Zero values mean week, 100, 1h.
type TrendingOptions struct {
	Window string
	Depth  int
	TTL    time.Duration
}

const (
	defaultTrendingDepth = 100
	defaultTrendingTTL   = time.Hour
	// TMDB returns 20 results per page.
	trendingPageSize = 20
	maxTrendingPages = 25
)

// NewTrendingIndex builds an index over the TMDB trending list. A nil TMDB
// client yields an index that reports nothing as trending.
func NewTrendingIndex(tmdb *TMDB, opts TrendingOptions) *TrendingIndex {
	window := strings.ToLower(strings.TrimSpace(opts.Window))
	if window != "day" {
		window = "week"
	}
	depth := opts.Depth
	if depth <= 0 {
		depth = defaultTrendingDepth
	}
	if maxDepth := trendingPageSize * maxTrendingPages; depth > maxDepth {
		depth = maxDepth
	}
	ttl := opts.TTL
	if ttl <= 0 {
		ttl = defaultTrendingTTL
	}
	return &TrendingIndex{tmdb: tmdb, window: window, depth: depth, ttl: ttl, ids: map[string]bool{}}
}

// IsTrending matches any of the ids the caller holds for a title. The list TMDB
// serves carries no external ids, so the index is keyed by TMDB id alone and a
// request made under an IMDb id only matches once its TMDB id is passed here
// too.
func (t *TrendingIndex) IsTrending(ctx context.Context, ids ...string) bool {
	if t == nil || t.tmdb == nil {
		return false
	}
	t.refreshIfStale(ctx)
	t.mu.RLock()
	defer t.mu.RUnlock()
	if t.failed {
		return false
	}
	for _, id := range ids {
		if key := normalizeTrendingKey(id); key != "" && t.ids[key] {
			return true
		}
	}
	return false
}

// normalizeTrendingKey reduces an id to the bare TMDB number, or an IMDb id.
func normalizeTrendingKey(id string) string {
	id = strings.ToLower(strings.TrimSpace(id))
	if id == "" {
		return ""
	}
	if strings.HasPrefix(id, "tt") {
		return id
	}
	id = strings.TrimPrefix(id, "tmdb:")
	for _, tok := range []string{"movie:", "series:", "tv:"} {
		id = strings.TrimPrefix(id, tok)
	}
	// An episode id carries season and episode after the title id.
	if i := strings.Index(id, ":"); i > 0 {
		id = id[:i]
	}
	if _, err := strconv.Atoi(id); err != nil {
		return ""
	}
	return id
}

func (t *TrendingIndex) refreshIfStale(ctx context.Context) {
	t.mu.RLock()
	fresh := !t.refreshed.IsZero() && time.Since(t.refreshed) < t.ttl
	t.mu.RUnlock()
	if fresh {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	// Another goroutine may have refreshed while this one waited.
	if !t.refreshed.IsZero() && time.Since(t.refreshed) < t.ttl {
		return
	}
	ids, err := t.fetch(ctx)
	t.refreshed = time.Now()
	if err != nil {
		t.failed = true
		slog.WarnContext(ctx, "Could not refresh the trending list, so no trending badge is drawn",
			"window", t.window, "error", err)
		return
	}
	t.failed = false
	t.ids = ids
	slog.InfoContext(ctx, "Refreshed the trending list", "window", t.window, "titles", len(ids))
}

// fetch pages the list until depth is reached.
func (t *TrendingIndex) fetch(ctx context.Context) (map[string]bool, error) {
	out := make(map[string]bool, t.depth*2)
	pages := (t.depth + trendingPageSize - 1) / trendingPageSize
	kept := 0
	for page := 1; page <= pages; page++ {
		var result struct {
			Results []tmdbListItem `json:"results"`
		}
		path := fmt.Sprintf("%s/trending/all/%s?page=%d", tmdbBaseURL, t.window, page)
		if err := t.tmdb.get(ctx, path, &result); err != nil {
			if page == 1 {
				return nil, err
			}
			// A later page failing still leaves a usable list.
			break
		}
		if len(result.Results) == 0 {
			break
		}
		for _, item := range result.Results {
			if item.MediaType != "movie" && item.MediaType != "tv" {
				continue
			}
			if kept >= t.depth {
				return out, nil
			}
			out[strconv.Itoa(item.ID)] = true
			kept++
		}
	}
	return out, nil
}

// Size returns the number of titles currently indexed.
func (t *TrendingIndex) Size() int {
	if t == nil {
		return 0
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	return len(t.ids)
}
