package cache

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func newTestCache(t *testing.T) *Cache {
	t.Helper()
	c, err := New(t.TempDir(), time.Hour, 100, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(c.Close)
	return c
}

func countBins(t *testing.T, dir string) int {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	n := 0
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".bin" {
			n++
		}
	}
	return n
}

func TestDeleteRemovesFromBothTiers(t *testing.T) {
	c := newTestCache(t)
	if err := c.Set("k1", []byte("payload")); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if _, ok := c.Get("k1"); !ok {
		t.Fatal("expected a hit before Delete")
	}
	if !c.Delete("k1") {
		t.Error("Delete reported nothing removed")
	}
	if _, ok := c.Get("k1"); ok {
		t.Error("entry still readable after Delete")
	}
	if n := countBins(t, c.dir); n != 0 {
		t.Errorf("%d disk files remain after Delete, want 0", n)
	}
}

func TestDeleteMissingKeyReportsFalse(t *testing.T) {
	c := newTestCache(t)
	if c.Delete("never-stored") {
		t.Error("Delete reported a removal for a key that was never stored")
	}
}

// Deleting an entry that was evicted from memory but still on disk must still
// remove the file, otherwise a purge-by-key silently leaves the render behind.
func TestDeleteClearsDiskWhenNotHot(t *testing.T) {
	c := newTestCache(t)
	if err := c.Set("k1", []byte("payload")); err != nil {
		t.Fatalf("Set: %v", err)
	}
	c.mu.Lock()
	if el, ok := c.hot["k1"]; ok {
		c.removeLocked(el)
	}
	c.mu.Unlock()

	if !c.Delete("k1") {
		t.Error("Delete reported nothing removed for a disk-only entry")
	}
	if n := countBins(t, c.dir); n != 0 {
		t.Errorf("%d disk files remain, want 0", n)
	}
}

func TestPurgeEmptiesTheCache(t *testing.T) {
	c := newTestCache(t)
	for _, k := range []string{"a", "b", "c"} {
		if err := c.Set(k, []byte("payload-"+k)); err != nil {
			t.Fatalf("Set %s: %v", k, err)
		}
	}
	if got := c.Purge(); got != 3 {
		t.Errorf("Purge removed %d, want 3", got)
	}
	for _, k := range []string{"a", "b", "c"} {
		if _, ok := c.Get(k); ok {
			t.Errorf("%q still readable after Purge", k)
		}
	}
	if n := countBins(t, c.dir); n != 0 {
		t.Errorf("%d disk files remain after Purge, want 0", n)
	}
	if s := c.Stats(); s.HotEntries != 0 || s.HotBytes != 0 || s.DiskEntries != 0 || s.DiskBytes != 0 {
		t.Errorf("stats not reset after Purge: %+v", s)
	}
}

func TestPurgeOnEmptyCacheIsSafe(t *testing.T) {
	c := newTestCache(t)
	if got := c.Purge(); got != 0 {
		t.Errorf("Purge on an empty cache removed %d, want 0", got)
	}
}

func TestCacheStillUsableAfterPurge(t *testing.T) {
	c := newTestCache(t)
	if err := c.Set("a", []byte("one")); err != nil {
		t.Fatalf("Set: %v", err)
	}
	c.Purge()
	if err := c.Set("b", []byte("two")); err != nil {
		t.Fatalf("Set after Purge: %v", err)
	}
	e, ok := c.Get("b")
	if !ok {
		t.Fatal("expected a hit for an entry written after Purge")
	}
	if string(e.Data) != "two" {
		t.Errorf("got %q, want %q", e.Data, "two")
	}
}
