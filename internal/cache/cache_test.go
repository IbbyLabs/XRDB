package cache

import (
	"bytes"
	"testing"
	"time"
)

func openTestCache(t *testing.T) *Cache {
	t.Helper()
	c, err := New(t.TempDir(), time.Minute, 10)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
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
	c, _ := New(t.TempDir(), time.Millisecond, 10)
	_ = c.Set("k1", []byte("data"))
	time.Sleep(5 * time.Millisecond)
	if _, ok := c.Get("k1"); ok {
		t.Error("expected expired entry to be a miss")
	}
}

func TestDiskPersistence(t *testing.T) {
	dir := t.TempDir()
	c1, _ := New(dir, time.Hour, 10)
	_ = c1.Set("persistent", []byte("important data"))

	// Re-open with empty hot tier
	c2, _ := New(dir, time.Hour, 10)
	e, ok := c2.Get("persistent")
	if !ok {
		t.Fatal("expected disk cache hit in new instance")
	}
	if !bytes.Equal(e.Data, []byte("important data")) {
		t.Errorf("data mismatch: got %q", e.Data)
	}
}

func TestLRUEviction(t *testing.T) {
	c, _ := New(t.TempDir(), time.Minute, 3)
	_ = c.Set("a", []byte("a"))
	_ = c.Set("b", []byte("b"))
	_ = c.Set("c", []byte("c"))
	_ = c.Set("d", []byte("d")) // should evict "a"

	c.mu.Lock()
	_, aInHot := c.hot["a"]
	c.mu.Unlock()
	if aInHot {
		t.Error("expected 'a' to be evicted from hot tier")
	}
	if len(c.hot) > 3 {
		t.Errorf("hot tier exceeded max: %d", len(c.hot))
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
}
