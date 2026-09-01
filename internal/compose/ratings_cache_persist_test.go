package compose

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"os"
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

	first := newRatingsCache(time.Hour, nil)
	first.path = filepath.Join(dir, ratingsCacheFile)
	if _, err := first.do(context.Background(), "tt1:imdb", func(context.Context) (*provider.MediaMeta, bool, error) {
		return metaWith("imdb"), true, nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := first.Save(); err != nil {
		t.Fatal(err)
	}

	// A fresh process, same directory.
	second := newRatingsCache(time.Hour, nil)
	second.path = filepath.Join(dir, ratingsCacheFile)
	second.load(logger)

	fetched := false
	got, err := second.do(context.Background(), "tt1:imdb", func(context.Context) (*provider.MediaMeta, bool, error) {
		fetched = true
		return metaWith("imdb"), true, nil
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
	c := newRatingsCache(time.Hour, nil)
	c.path = filepath.Join(dir, ratingsCacheFile)
	c.entries["stale"] = ratingsEntry{Meta: metaWith("rt"), ExpiresAt: time.Now().Add(-time.Minute)}
	c.entries["fresh"] = ratingsEntry{Meta: metaWith("imdb"), ExpiresAt: time.Now().Add(time.Hour)}
	if err := c.Save(); err != nil {
		t.Fatal(err)
	}

	next := newRatingsCache(time.Hour, nil)
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
	c := newRatingsCache(time.Hour, nil)
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
	if err := newRatingsCache(time.Hour, nil).Save(); err != nil {
		t.Errorf("Save without a path errored: %v", err)
	}
	var nilCache *ratingsCache
	if err := nilCache.Save(); err != nil {
		t.Errorf("Save on a nil cache errored: %v", err)
	}
}

// An older-shape snapshot is discarded on load, so a title cached before a
// MediaMeta field existed is refetched rather than served without the field.
func TestAnOlderShapeSnapshotIsDiscarded(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ratingsCacheFile)

	// Hand-write a snapshot claiming an older shape.
	old := ratingsSnapshot{Shape: ratingsCacheShape - 1, Entries: map[string]ratingsEntry{
		"tt1:imdb": {Meta: metaWith("imdb"), ExpiresAt: time.Now().Add(time.Hour)},
	}}
	data, _ := json.Marshal(old)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}

	c := newRatingsCache(time.Hour, nil)
	c.path = path
	c.load(slog.New(slog.DiscardHandler))
	if c.Len() != 0 {
		t.Errorf("an older-shape snapshot was loaded: %d entries kept", c.Len())
	}
}

// Fixing how one source is read must not throw away every other source's
// remembered answers. It used to: one counter covered them all, so correcting
// MDBList's Metacritic spelling discarded IMDb, Trakt and Cinemeta as well, and
// each repopulation is paid for against a source that meters by the day.
func TestOnlyTheChangedSourceLosesItsRememberedRatings(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ratings.json")

	live := map[string]ratingsEntry{
		provider.GoodKey("mdblist", "movie", "tt1"): {Meta: &provider.MediaMeta{Title: "A"}, ExpiresAt: time.Now().Add(time.Hour)},
		provider.GoodKey("imdb", "movie", "tt1"):    {Meta: &provider.MediaMeta{Title: "A"}, ExpiresAt: time.Now().Add(time.Hour)},
		provider.GoodKey("trakt", "movie", "tt1"):   {Meta: &provider.MediaMeta{Title: "A"}, ExpiresAt: time.Now().Add(time.Hour)},
	}
	// Written when mdblist was one version behind; every other source current.
	old := map[string]int{}
	for k, v := range ratingsSourceShape {
		old[k] = v
	}
	old["mdblist"] = ratingsSourceShape["mdblist"] - 1
	data, err := json.Marshal(ratingsSnapshot{Shape: ratingsCacheShape, SourceShapes: old, Entries: live})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}

	c := newRatingsCache(time.Hour, nil)
	c.path = path
	c.load(slog.New(slog.NewTextHandler(io.Discard, nil)))

	if _, ok := c.entries[provider.GoodKey("mdblist", "movie", "tt1")]; ok {
		t.Error("the changed source's entry survived, so a parser fix would serve the old reading")
	}
	for _, src := range []string{"imdb", "trakt"} {
		if _, ok := c.entries[provider.GoodKey(src, "movie", "tt1")]; !ok {
			t.Errorf("%s was discarded for a change to a different source", src)
		}
	}
}

// A file written before per-source versions existed carries none. It must keep
// every source that has not changed since, rather than being discarded whole.
func TestLegacySnapshotKeepsUnchangedSources(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ratings.json")
	live := map[string]ratingsEntry{
		provider.GoodKey("imdb", "movie", "tt1"):    {Meta: &provider.MediaMeta{Title: "A"}, ExpiresAt: time.Now().Add(time.Hour)},
		provider.GoodKey("mdblist", "movie", "tt1"): {Meta: &provider.MediaMeta{Title: "A"}, ExpiresAt: time.Now().Add(time.Hour)},
	}
	// No SourceShapes at all, as an older build wrote it.
	data, _ := json.Marshal(ratingsSnapshot{Shape: ratingsCacheShape, Entries: live})
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	c := newRatingsCache(time.Hour, nil)
	c.path = path
	c.load(slog.New(slog.NewTextHandler(io.Discard, nil)))

	if _, ok := c.entries[provider.GoodKey("imdb", "movie", "tt1")]; !ok {
		t.Error("an unchanged source was discarded, so the upgrade costs a full refetch")
	}
	if _, ok := c.entries[provider.GoodKey("mdblist", "movie", "tt1")]; ok {
		t.Error("a source whose reading changed survived the upgrade")
	}
}
