package cache

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The index exists so a sweep opens nothing. Its correctness question is not
// "does it hold the right value" but "does it stay in step with the disk" — an
// index that disagrees with the files is worse than no index, because the sweep
// would delete live entries or keep dead ones.

// Entries written this process are indexed, so the sweep never reads them.
func TestWritingAnEntryIndexesItsExpiry(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	if err := c.Set("k", []byte("v")); err != nil {
		t.Fatalf("Set: %v", err)
	}

	c.expiryMu.RLock()
	n := len(c.expiryIndex)
	c.expiryMu.RUnlock()
	if n != 1 {
		t.Fatalf("index holds %d entries after one write", n)
	}
}

// Removal has to shrink it, or a long-lived process accumulates an entry per
// render ever written and the index outgrows the cache it describes.
func TestRemovalDropsTheEntryFromTheIndex(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	for i := 0; i < 20; i++ {
		if err := c.Set(fmt.Sprintf("k%d", i), []byte("v")); err != nil {
			t.Fatalf("Set: %v", err)
		}
	}
	c.expiryMu.RLock()
	before := len(c.expiryIndex)
	c.expiryMu.RUnlock()
	if before != 20 {
		t.Fatalf("index holds %d entries after twenty writes", before)
	}

	// Evict most of them.
	c.sweepWithBounds(5, 1<<40)

	c.expiryMu.RLock()
	after := len(c.expiryIndex)
	c.expiryMu.RUnlock()
	if after >= before {
		t.Fatalf("index did not shrink: %d before, %d after", before, after)
	}
	if after != 5 {
		t.Fatalf("index holds %d entries against 5 files on disk", after)
	}
}

// An entry written before this process started is not in the index, so it must
// still be read from the file — and indexed on the way past, so the cost is one
// pass after a restart rather than one per sweep.
func TestAnUnindexedEntryIsReadOnceThenRemembered(t *testing.T) {
	dir := t.TempDir()
	first, err := New(dir, time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := first.Set("k", []byte("v")); err != nil {
		t.Fatalf("Set: %v", err)
	}
	first.Close()

	// A fresh Cache over the same directory: the file exists, the index is empty.
	second, err := New(dir, time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer second.Close()

	second.expiryMu.RLock()
	n := len(second.expiryIndex)
	second.expiryMu.RUnlock()
	if n != 0 {
		t.Fatalf("a fresh cache started with %d indexed entries", n)
	}

	// A sweep that removes nothing still walks, so it reads and indexes.
	second.sweepWithBounds(1000, 1<<40)

	second.expiryMu.RLock()
	n = len(second.expiryIndex)
	second.expiryMu.RUnlock()
	if n != 1 {
		t.Fatalf("the entry was not indexed after a sweep: %d", n)
	}
}

// A file removed outside the cache's own paths — a crash mid-write, someone
// clearing the directory by hand — leaves its key behind. The sweep already
// walks every file to reconcile the counters, so it can drop those in the same
// pass.
func TestTheSweepDropsIndexKeysWithNoFile(t *testing.T) {
	dir := t.TempDir()
	c, err := New(dir, time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	for i := 0; i < 10; i++ {
		if err := c.Set(fmt.Sprintf("k%d", i), []byte("v")); err != nil {
			t.Fatalf("Set: %v", err)
		}
	}

	// Delete behind the cache's back, as an external process would.
	des, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	removed := 0
	for _, de := range des {
		if filepath.Ext(de.Name()) != ".bin" || removed >= 4 {
			continue
		}
		if err := os.Remove(filepath.Join(dir, de.Name())); err == nil {
			removed++
		}
	}
	if removed != 4 {
		t.Fatalf("removed %d files behind the cache, wanted 4", removed)
	}

	c.expiryMu.RLock()
	before := len(c.expiryIndex)
	c.expiryMu.RUnlock()
	if before != 10 {
		t.Fatalf("index holds %d before the sweep, so the drop below proves nothing", before)
	}

	c.sweepWithBounds(1000, 1<<40)

	c.expiryMu.RLock()
	after := len(c.expiryIndex)
	c.expiryMu.RUnlock()
	if after != 6 {
		t.Fatalf("index holds %d after the sweep, wanted 6", after)
	}
}
