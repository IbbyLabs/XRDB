package compose

import (
	"context"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

func metaWith(source string) *provider.MediaMeta {
	return &provider.MediaMeta{Ratings: []provider.Rating{{Source: source, Value: 8, Label: "8.0"}}}
}

// The point of the disk tier: a restart must not cost the upstream fetch again.
func TestRememberedRatingsSurviveARestart(t *testing.T) {
	dir := t.TempDir()
	logger := slog.New(slog.DiscardHandler)

	first := newRatingsCache(time.Hour)
	first.path = filepath.Join(dir, ratingsCacheFile)
	if _, err := first.do(context.Background(), "tt1:imdb", func() (*provider.MediaMeta, error) {
		return metaWith("imdb"), nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := first.Save(); err != nil {
		t.Fatal(err)
	}

	// A fresh process, same directory.
	second := newRatingsCache(time.Hour)
	second.path = filepath.Join(dir, ratingsCacheFile)
	second.load(logger)

	fetched := false
	got, err := second.do(context.Background(), "tt1:imdb", func() (*provider.MediaMeta, error) {
		fetched = true
		return metaWith("imdb"), nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if fetched {
		t.Error("the answer was refetched after a restart")
	}
	if got == nil || len(got.Ratings) != 1 || got.Ratings[0].Source != "imdb" {
		t.Errorf("restored the wrong answer: %+v", got)
	}
}

// An entry past its TTL must not come back from disk.
func TestExpiredAnswersAreNotRestored(t *testing.T) {
	dir := t.TempDir()
	c := newRatingsCache(time.Hour)
	c.path = filepath.Join(dir, ratingsCacheFile)
	c.entries["stale"] = ratingsEntry{Meta: metaWith("rt"), ExpiresAt: time.Now().Add(-time.Minute)}
	c.entries["fresh"] = ratingsEntry{Meta: metaWith("imdb"), ExpiresAt: time.Now().Add(time.Hour)}
	if err := c.Save(); err != nil {
		t.Fatal(err)
	}

	next := newRatingsCache(time.Hour)
	next.path = c.path
	next.load(slog.New(slog.DiscardHandler))
	if _, ok := next.entries["stale"]; ok {
		t.Error("an expired answer was restored")
	}
	if _, ok := next.entries["fresh"]; !ok {
		t.Error("a live answer was dropped")
	}
}

// Hitting the cap used to discard everything, which refetched every title still
// in use in one burst against metered sources.
func TestTheCapEvictsRatherThanEmptying(t *testing.T) {
	c := newRatingsCache(time.Hour)
	now := time.Now()
	for i := 0; i < ratingsCacheMax; i++ {
		c.entries[string(rune(i))+"k"] = ratingsEntry{
			Meta: metaWith("imdb"), ExpiresAt: now.Add(time.Duration(i) * time.Second),
		}
	}
	before := len(c.entries)
	c.evictLocked()
	after := len(c.entries)

	if after == 0 {
		t.Fatal("eviction emptied the cache")
	}
	if after >= before {
		t.Errorf("eviction freed nothing: %d -> %d", before, after)
	}
	// The soonest to expire is the one that should have gone.
	if _, ok := c.entries[string(rune(0))+"k"]; ok {
		t.Error("the entry closest to expiry survived")
	}
}

// Persistence is optional: with no path set nothing is written and nothing errors.
func TestSaveIsANoOpWithoutAPath(t *testing.T) {
	if err := newRatingsCache(time.Hour).Save(); err != nil {
		t.Errorf("Save without a path errored: %v", err)
	}
	var nilCache *ratingsCache
	if err := nilCache.Save(); err != nil {
		t.Errorf("Save on a nil cache errored: %v", err)
	}
}
