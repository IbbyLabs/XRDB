package cache

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func typedCache(t *testing.T) *Cache {
	t.Helper()
	c, err := New(t.TempDir(), time.Hour, 1000, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	return c
}

// A digest is one-way, so a cache holding keys alone can say how many entries it
// has and nothing about what they are. Carrying the surface makes both the count
// and a per-surface delete answerable from the key (FR-184).
func TestTheCacheCountsAndClearsBySurface(t *testing.T) {
	c := typedCache(t)
	for _, k := range []string{"poster:aaa", "poster:bbb", "backdrop:ccc"} {
		if err := c.Set(k, []byte("some bytes")); err != nil {
			t.Fatal(err)
		}
	}

	stats := c.Stats()
	if got := stats.BySurface["poster"].Entries; got != 2 {
		t.Errorf("posters = %d, want 2 (%+v)", got, stats.BySurface)
	}
	if got := stats.BySurface["backdrop"].Entries; got != 1 {
		t.Errorf("backdrops = %d, want 1", got)
	}
	if stats.BySurface["poster"].Bytes <= 0 {
		t.Error("posters report no bytes")
	}

	if removed := c.DeleteSurface("poster"); removed != 2 {
		t.Errorf("removed %d posters, want 2", removed)
	}
	if _, ok := c.Get("poster:aaa"); ok {
		t.Error("a poster survived its surface being cleared")
	}
	// The control: another surface is untouched, so this is a per-surface delete
	// rather than a purge.
	if _, ok := c.Get("backdrop:ccc"); !ok {
		t.Error("clearing posters took the backdrop with it")
	}
}

// A key written before the surface was carried has none, and must not be
// mistaken for one or given a path separator.
func TestAnUntypedKeyCarriesNoSurface(t *testing.T) {
	for _, key := range []string{"deadbeef", "", "POSTER:aaa", "a/b:c", "9:x", ":x"} {
		if got := keyType(key); got != "" {
			t.Errorf("keyType(%q) = %q, want none", key, got)
		}
	}
	if got := keyType("poster:abc"); got != "poster" {
		t.Errorf("keyType = %q, want poster", got)
	}
}

// An old entry is left to age out rather than removed, so the change takes less
// than it is asked for rather than more.
func TestClearingASurfaceLeavesUntypedEntries(t *testing.T) {
	c := typedCache(t)
	if err := c.Set("deadbeef", []byte("old")); err != nil {
		t.Fatal(err)
	}
	if err := c.Set("poster:aaa", []byte("new")); err != nil {
		t.Fatal(err)
	}
	c.DeleteSurface("poster")
	if _, ok := c.Get("deadbeef"); !ok {
		t.Error("an entry with no surface was removed by a per-surface delete")
	}
}

// The file name is what the count and the delete both read, so it has to carry
// the surface and stay inside the cache directory.
func TestTheFileNameCarriesTheSurface(t *testing.T) {
	c := typedCache(t)
	if err := c.Set("poster:aaa", []byte("x")); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(c.dir)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".bin" && typeOfFile(e.Name()) == "poster" {
			found = true
		}
	}
	if !found {
		t.Error("no file on disk names its surface")
	}
}
