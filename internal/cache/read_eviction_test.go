package cache

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// Eviction takes never-read entries first. The property is that being asked for
// again is what saves an entry, so each test here has to establish that the
// surviving entry would have lost on age alone.

func mustSet(t *testing.T, c *Cache, key, val string) {
	t.Helper()
	if err := c.Set(key, []byte(val)); err != nil {
		t.Fatalf("Set %s: %v", key, err)
	}
	// mtime has one second of resolution on some filesystems, so an ordering
	// test that writes two entries in the same instant cannot tell them apart.
	time.Sleep(10 * time.Millisecond)
}

func onDisk(t *testing.T, c *Cache, key string) bool {
	t.Helper()
	_, err := os.Stat(c.diskPath(key))
	return err == nil
}

// The oldest entry survives when it is the one people came back to.
func TestAReadEntrySurvivesAYoungerUnreadOne(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 100, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	settled(t, c)
	defer c.Close()

	mustSet(t, c, "read", "a")
	mustSet(t, c, "unread", "b")

	if _, ok := c.Get("read"); !ok {
		t.Fatal("Get read: miss")
	}

	c.sweepWithBounds(1, 1<<30)

	if !onDisk(t, c, "read") {
		t.Error("the read entry was evicted despite being asked for again")
	}
	if onDisk(t, c, "unread") {
		t.Error("the never-read entry survived a bound of one file")
	}
}

// Age still decides between two entries with the same read history, which is
// the behaviour every entry written before this process falls back to.
func TestAgeDecidesAmongEntriesWithTheSameHistory(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 100, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	settled(t, c)
	defer c.Close()

	mustSet(t, c, "older", "a")
	mustSet(t, c, "newer", "b")

	c.sweepWithBounds(1, 1<<30)

	if onDisk(t, c, "older") {
		t.Error("the older entry survived when neither had been read")
	}
	if !onDisk(t, c, "newer") {
		t.Error("the newer entry was evicted when neither had been read")
	}
}

// A hot hit returns from memory without touching the disk path. Marking only
// the disk branch would leave the most popular entries indexed as never-read,
// which is the opposite of the intent.
func TestAHotHitProtectsTheDiskEntryBehindIt(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 100, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	settled(t, c)
	defer c.Close()

	mustSet(t, c, "hot", "a")
	mustSet(t, c, "cold", "b")

	// Set leaves the entry hot, so these reads never reach the disk.
	for i := 0; i < 5; i++ {
		if _, ok := c.Get("hot"); !ok {
			t.Fatalf("Get hot #%d: miss", i)
		}
	}
	c.mu.Lock()
	_, stillHot := c.hot["hot"]
	c.mu.Unlock()
	if !stillHot {
		t.Fatal("the key left the hot tier, so this exercises the disk path instead")
	}

	c.sweepWithBounds(1, 1<<30)

	if !onDisk(t, c, "hot") {
		t.Error("a hot-tier read did not protect the disk entry behind it")
	}
}

// Read history has to leave with the entry, or a re-used key inherits the
// protection of the one it replaced and the map grows without bound.
func TestRemovalForgetsTheReadMarker(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 100, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	settled(t, c)
	defer c.Close()

	mustSet(t, c, "k", "a")
	if _, ok := c.Get("k"); !ok {
		t.Fatal("Get: miss")
	}
	name := filepath.Base(c.diskPath("k"))
	if !c.wasRead(name) {
		t.Fatal("the read was not recorded")
	}

	c.sweepWithBounds(0, 0)

	if c.wasRead(name) {
		t.Error("the read marker outlived the entry")
	}
}

// noteRead runs outside the entry lock, so the read map needs its own. Without
// a parallel reader and writer the race detector has nothing to observe here.
func TestConcurrentReadsAndSweeps(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 200, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	settled(t, c)
	defer c.Close()

	for i := 0; i < 50; i++ {
		if err := c.Set(fmt.Sprintf("k%d", i), []byte("v")); err != nil {
			t.Fatalf("Set: %v", err)
		}
	}

	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				c.Get(fmt.Sprintf("k%d", (g*7+i)%50))
			}
		}(g)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 20; i++ {
			c.sweepWithBounds(40, 1<<30)
		}
	}()
	wg.Wait()
}

// A long-lived process reads far more distinct entries than it holds, so the
// read map has to shrink when entries leave by any route, not only the one that
// calls forgetExpiry.
func TestReadMarkersDoNotOutliveTheirFiles(t *testing.T) {
	dir := t.TempDir()
	c, err := New(dir, time.Hour, 200, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	settled(t, c)
	defer c.Close()

	mustSet(t, c, "k", "a")
	if _, ok := c.Get("k"); !ok {
		t.Fatal("Get: miss")
	}
	name := filepath.Base(c.diskPath("k"))

	// Removed behind the cache's back, the way an operator clearing the volume
	// or a crash mid-write leaves it.
	if err := os.Remove(c.diskPath("k")); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	c.sweepWithBounds(100, 1<<30)

	if c.wasRead(name) {
		t.Error("the read marker survived a file that is gone from disk")
	}
}

// Among entries that have all been read, the one asked for longest ago goes
// first. A flag cannot express this: it would leave every read entry equal and
// fall back to write age, which is the order a cache is meant to improve on.
func TestLeastRecentlyReadGoesFirst(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 100, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	settled(t, c)
	defer c.Close()

	// Written newest-first, so write age and read recency disagree.
	mustSet(t, c, "b", "b")
	mustSet(t, c, "a", "a")

	if _, ok := c.Get("a"); !ok {
		t.Fatal("Get a: miss")
	}
	time.Sleep(5 * time.Millisecond)
	if _, ok := c.Get("b"); !ok {
		t.Fatal("Get b: miss")
	}

	c.sweepWithBounds(1, 1<<30)

	if onDisk(t, c, "a") {
		t.Error("the entry read longest ago survived")
	}
	if !onDisk(t, c, "b") {
		t.Error("the most recently read entry was evicted")
	}
}
