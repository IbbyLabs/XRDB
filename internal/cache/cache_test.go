package cache

import (
	"bytes"
	"path/filepath"
	"testing"
	"time"
)

func openTestCache(t *testing.T) *Cache {
	t.Helper()
	c, err := New(t.TempDir(), time.Minute, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(c.Close)
	return c
}

func TestSetAndGet(t *testing.T) {
	c := openTestCache(t)
	data := []byte("hello world")
	if err := c.Set("k1", data); err != nil {
		t.Fatalf("Set: %v", err)
	}
	e, ok := c.Get("k1")
	if !ok {
		t.Fatal("expected cache hit")
	}
	if !bytes.Equal(e.Data, data) {
		t.Errorf("got %q, want %q", e.Data, data)
	}
}

func TestMissReturnsNotFound(t *testing.T) {
	c := openTestCache(t)
	if _, ok := c.Get("nonexistent"); ok {
		t.Error("expected cache miss")
	}
}

func TestExpiredEntryIsAMiss(t *testing.T) {
	c, _ := New(t.TempDir(), time.Millisecond, 10, 1<<20)
	t.Cleanup(c.Close)
	_ = c.Set("k1", []byte("data"))
	time.Sleep(5 * time.Millisecond)
	if _, ok := c.Get("k1"); ok {
		t.Error("expected expired entry to be a miss")
	}
}

func TestDiskPersistence(t *testing.T) {
	dir := t.TempDir()
	c1, _ := New(dir, time.Hour, 10, 1<<20)
	t.Cleanup(c1.Close)
	_ = c1.Set("persistent", []byte("important data"))

	// Re-open with empty hot tier
	c2, _ := New(dir, time.Hour, 10, 1<<20)
	t.Cleanup(c2.Close)
	e, ok := c2.Get("persistent")
	if !ok {
		t.Fatal("expected disk cache hit in new instance")
	}
	if !bytes.Equal(e.Data, []byte("important data")) {
		t.Errorf("data mismatch: got %q", e.Data)
	}
}

func TestLRUEviction(t *testing.T) {
	c, _ := New(t.TempDir(), time.Minute, 3, 1<<20)
	t.Cleanup(c.Close)
	_ = c.Set("a", []byte("a"))
	_ = c.Set("b", []byte("b"))
	_ = c.Set("c", []byte("c"))
	_ = c.Set("d", []byte("d")) // should evict "a"

	c.mu.Lock()
	_, aInHot := c.hot["a"]
	hotLen := len(c.hot)
	c.mu.Unlock()
	if aInHot {
		t.Error("expected 'a' to be evicted from hot tier")
	}
	if hotLen > 3 {
		t.Errorf("hot tier exceeded max: %d", hotLen)
	}
}

func TestByteCapEviction(t *testing.T) {
	c, err := New(t.TempDir(), time.Minute, 100, 30)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(c.Close)
	_ = c.Set("a", bytes.Repeat([]byte("a"), 20))
	_ = c.Set("b", bytes.Repeat([]byte("b"), 20)) // 40 bytes total exceeds the 30 byte cap

	c.mu.Lock()
	_, aInHot := c.hot["a"]
	_, bInHot := c.hot["b"]
	hotBytes := c.hotBytes
	c.mu.Unlock()
	if aInHot {
		t.Error("expected 'a' to be evicted by the byte cap")
	}
	if !bInHot {
		t.Error("expected 'b' to stay resident")
	}
	if hotBytes > 30 {
		t.Errorf("hot bytes above cap: %d", hotBytes)
	}
}

func TestSweepRemovesExpiredDiskEntries(t *testing.T) {
	dir := t.TempDir()
	c, _ := New(dir, 5*time.Millisecond, 10, 1<<20)
	t.Cleanup(c.Close)
	_ = c.Set("gone", []byte("payload"))
	time.Sleep(10 * time.Millisecond)

	c.sweep()

	remaining, _ := filepath.Glob(filepath.Join(dir, "*.bin"))
	if len(remaining) != 0 {
		t.Errorf("expected expired file removed, found %d", len(remaining))
	}
	if got := c.Stats().DiskEntries; got != 0 {
		t.Errorf("expected 0 disk entries after sweep, got %d", got)
	}
}

func TestSweepEnforcesDiskFileBound(t *testing.T) {
	dir := t.TempDir()
	c, _ := New(dir, time.Hour, 10, 1<<20)
	t.Cleanup(c.Close)
	for _, key := range []string{"a", "b", "c", "d", "e"} {
		_ = c.Set(key, []byte("data-"+key))
	}

	c.sweepWithBounds(3, 1<<20)

	remaining, _ := filepath.Glob(filepath.Join(dir, "*.bin"))
	if len(remaining) != 3 {
		t.Errorf("expected 3 files after bounded sweep, found %d", len(remaining))
	}
	if got := c.Stats().DiskEntries; got != 3 {
		t.Errorf("expected 3 disk entries reported, got %d", got)
	}
}

func TestStats(t *testing.T) {
	c := openTestCache(t)
	_ = c.Set("x", []byte("data"))
	s := c.Stats()
	if s.HotEntries != 1 {
		t.Errorf("expected 1 hot entry, got %d", s.HotEntries)
	}
	if s.DiskEntries != 1 {
		t.Errorf("expected 1 disk entry, got %d", s.DiskEntries)
	}
	if s.HotBytes != int64(len("data")) {
		t.Errorf("expected hot bytes %d, got %d", len("data"), s.HotBytes)
	}
}

// The disk tier is what a catalogue re-read hits, so a 2 GiB default holding a
// few thousand renders means re-rendering titles rendered hours ago. An instance
// with disk to spare must be able to raise it.
func TestSetDiskBoundsOverridesTheDefaults(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	if c.maxDiskBytes != defaultMaxDiskBytes || c.maxDiskFiles != defaultMaxDiskFiles {
		t.Fatalf("defaults not applied: files=%d bytes=%d", c.maxDiskFiles, c.maxDiskBytes)
	}
	c.SetDiskBounds(50_000, 20<<30)
	if c.maxDiskFiles != 50_000 || c.maxDiskBytes != 20<<30 {
		t.Errorf("bounds not raised: files=%d bytes=%d", c.maxDiskFiles, c.maxDiskBytes)
	}
	// Zero and negative leave a bound alone, so one can be set without the other.
	c.SetDiskBounds(0, -1)
	if c.maxDiskFiles != 50_000 || c.maxDiskBytes != 20<<30 {
		t.Errorf("a non-positive value overwrote a bound: files=%d bytes=%d", c.maxDiskFiles, c.maxDiskBytes)
	}
}
