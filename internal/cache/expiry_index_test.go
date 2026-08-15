package cache

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
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
	settled(t, c)
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
	settled(t, c)
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
	settled(t, first)
	if err := first.Set("k", []byte("v")); err != nil {
		t.Fatalf("Set: %v", err)
	}
	first.Close()

	// A fresh Cache over the same directory. The startup pass walks it, so the
	// file's expiry is read once and held from then on.
	second, err := New(dir, time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	settled(t, second)
	defer second.Close()

	second.expiryMu.RLock()
	n := len(second.expiryIndex)
	second.expiryMu.RUnlock()
	if n != 1 {
		t.Fatalf("the entry was not indexed by the startup pass: %d", n)
	}

	// Every later sweep answers from the index. Reading the value back is what
	// makes the difference between held and re-read observable at all.
	name := filepath.Base(second.diskPath("k"))
	second.expiryMu.RLock()
	held := second.expiryIndex[name]
	second.expiryMu.RUnlock()
	if held == 0 {
		t.Fatal("the index holds no expiry for the entry")
	}

	second.sweepWithBounds(1000, 1<<40)

	second.expiryMu.RLock()
	n = len(second.expiryIndex)
	again := second.expiryIndex[name]
	second.expiryMu.RUnlock()
	if n != 1 || again != held {
		t.Fatalf("a later sweep changed the held expiry: %d entries, %d then %d", n, held, again)
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
	settled(t, c)
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

// A write that lands while a sweep is scanning must keep its index entry. The
// window is widest on a near-empty directory: the scan finds few names, so a
// prune list taken after it drops nearly everything written in between.
func TestAWriteDuringASweepKeepsItsIndexEntry(t *testing.T) {
	for attempt := 0; attempt < 40; attempt++ {
		dir := t.TempDir()
		c, err := New(dir, time.Hour, 500, 1<<22)
		if err != nil {
			t.Fatalf("New: %v", err)
		}

		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			c.sweepWithBounds(10000, 1<<40)
		}()
		go func() {
			defer wg.Done()
			for i := 0; i < 10; i++ {
				if err := c.Set(fmt.Sprintf("k%d", i), []byte("v")); err != nil {
					t.Errorf("Set: %v", err)
					return
				}
			}
		}()
		wg.Wait()

		des, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("ReadDir: %v", err)
		}
		onDisk, missing := 0, 0
		c.expiryMu.RLock()
		for _, de := range des {
			if filepath.Ext(de.Name()) != ".bin" {
				continue
			}
			onDisk++
			if _, ok := c.expiryIndex[de.Name()]; !ok {
				missing++
			}
		}
		c.expiryMu.RUnlock()
		c.Close()

		if onDisk == 0 {
			t.Fatal("no entries on disk, so the index check proves nothing")
		}
		if missing != 0 {
			t.Fatalf("attempt %d: %d of %d entries on disk lost their index entry to a concurrent sweep", attempt, missing, onDisk)
		}
	}
}

// New returns before the pass that builds the index has run, so a test that
// inspects the index without waiting is racing that pass rather than measuring
// the cache. It wins most of the time, which is worse than losing.
func settled(t *testing.T, c *Cache) {
	t.Helper()
	select {
	case <-c.swept:
	case <-time.After(10 * time.Second):
		t.Fatal("the startup index pass did not finish")
	}
}
