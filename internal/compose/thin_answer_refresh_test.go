package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// The refresh-ahead window was a fraction of the cache's base term while the
// entry's own term could be far shorter. A thin answer stands for ten minutes
// against a 24h base, so every hit on one was inside a 2.4h window and started
// a fetch — spending allowance on exactly the answers that are thin because an
// allowance ran out.
func TestAThinAnswerIsNotRefreshedOnEveryHit(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	meta := &provider.MediaMeta{Ratings: []provider.Rating{{Source: "imdb", Value: 7.5}}}

	c.mu.Lock()
	c.storeLocked("k", meta, false, 0)
	e := c.entries["k"]
	c.mu.Unlock()

	if got := e.TTL; got != PartialRatingsCacheTTL {
		t.Fatalf("a thin answer was stored for %v, want the partial term %v", got, PartialRatingsCacheTTL)
	}

	fetched := make(chan struct{}, 1)
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		fetched <- struct{}{}
		return meta, true, nil
	}

	c.mu.Lock()
	c.refreshAheadLocked(context.Background(), "k", e, 0, fetch)
	c.mu.Unlock()

	select {
	case <-fetched:
		t.Error("a freshly stored thin answer started a refresh; the window is wider than its term")
	case <-time.After(150 * time.Millisecond):
	}
}

// The window still has to open near the end of the entry's own term, or the
// refresh-ahead does nothing at all.
func TestAThinAnswerNearItsEndStillRefreshes(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	meta := &provider.MediaMeta{Ratings: []provider.Rating{{Source: "imdb", Value: 7.5}}}

	fetched := make(chan struct{}, 1)
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		fetched <- struct{}{}
		return meta, true, nil
	}

	// Inside a tenth of the ten-minute partial term.
	e := ratingsEntry{Meta: meta, ExpiresAt: time.Now().Add(30 * time.Second), TTL: PartialRatingsCacheTTL}

	c.mu.Lock()
	c.refreshAheadLocked(context.Background(), "k", e, 0, fetch)
	c.mu.Unlock()

	select {
	case <-fetched:
	case <-time.After(2 * time.Second):
		t.Error("a thin answer close to expiry did not refresh ahead")
	}
}

// An entry written before the term was stored has no TTL, and reading that as
// zero would switch refresh-ahead off rather than fall back.
func TestAnEntryWithNoStoredTermFallsBackToTheBase(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	meta := &provider.MediaMeta{Ratings: []provider.Rating{{Source: "imdb", Value: 7.5}}}

	fetched := make(chan struct{}, 1)
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		fetched <- struct{}{}
		return meta, true, nil
	}

	e := ratingsEntry{Meta: meta, ExpiresAt: time.Now().Add(time.Minute)}

	c.mu.Lock()
	c.refreshAheadLocked(context.Background(), "k", e, 0, fetch)
	c.mu.Unlock()

	select {
	case <-fetched:
	case <-time.After(2 * time.Second):
		t.Error("an entry with no stored term did not refresh; the base fallback is missing")
	}
}
