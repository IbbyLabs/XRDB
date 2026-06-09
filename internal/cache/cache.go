// Package cache provides a two-tier render cache: in-memory LRU backed by the filesystem.
package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Entry is a cached render result.
type Entry struct {
	Data      []byte
	ExpiresAt time.Time
}

// Cache is a thread-safe two-tier render cache.
// Hot entries live in memory (bounded by maxEntries); all entries persist to disk.
type Cache struct {
	mu         sync.Mutex
	dir        string
	ttl        time.Duration
	maxEntries int
	hot        map[string]*Entry // in-memory tier
	order      []string          // insertion order for LRU eviction
}

// New creates a Cache backed by dir with the given TTL and memory cap.
func New(dir string, ttl time.Duration, maxEntries int) (*Cache, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("cache mkdir: %w", err)
	}
	return &Cache{
		dir:        dir,
		ttl:        ttl,
		maxEntries: maxEntries,
		hot:        make(map[string]*Entry, maxEntries),
		order:      make([]string, 0, maxEntries),
	}, nil
}

// Get returns a cached entry for key, or (nil, false) on miss or expiry.
func (c *Cache) Get(key string) (*Entry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Hot tier
	if e, ok := c.hot[key]; ok {
		if time.Now().Before(e.ExpiresAt) {
			return e, true
		}
		c.evict(key)
	}

	// Disk tier
	data, err := os.ReadFile(c.diskPath(key))
	if err != nil {
		return nil, false
	}
	if len(data) < 8 {
		return nil, false
	}
	// First 8 bytes: Unix nanosecond expiry (big-endian int64)
	exp := int64(data[0])<<56 | int64(data[1])<<48 | int64(data[2])<<40 | int64(data[3])<<32 |
		int64(data[4])<<24 | int64(data[5])<<16 | int64(data[6])<<8 | int64(data[7])
	if time.Now().UnixNano() > exp {
		_ = os.Remove(c.diskPath(key))
		return nil, false
	}
	e := &Entry{Data: data[8:], ExpiresAt: time.Unix(0, exp)}
	c.store(key, e)
	return e, true
}

// Set stores data for key in both tiers.
func (c *Cache) Set(key string, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	exp := time.Now().Add(c.ttl)
	e := &Entry{Data: data, ExpiresAt: exp}
	c.store(key, e)

	// Persist to disk
	expNs := exp.UnixNano()
	hdr := [8]byte{
		byte(expNs >> 56), byte(expNs >> 48), byte(expNs >> 40), byte(expNs >> 32),
		byte(expNs >> 24), byte(expNs >> 16), byte(expNs >> 8), byte(expNs),
	}
	payload := make([]byte, 8+len(data))
	copy(payload[:8], hdr[:])
	copy(payload[8:], data)

	if err := os.WriteFile(c.diskPath(key), payload, 0o644); err != nil {
		return fmt.Errorf("cache write: %w", err)
	}
	return nil
}

// Stats returns a snapshot of cache state.
func (c *Cache) Stats() Stats {
	c.mu.Lock()
	defer c.mu.Unlock()
	entries, _ := filepath.Glob(filepath.Join(c.dir, "*.bin"))
	return Stats{
		HotEntries:  len(c.hot),
		DiskEntries: len(entries),
		Dir:         c.dir,
		TTL:         c.ttl.String(),
	}
}

// Stats is a point-in-time view of cache state.
type Stats struct {
	HotEntries  int    `json:"hotEntries"`
	DiskEntries int    `json:"diskEntries"`
	Dir         string `json:"dir"`
	TTL         string `json:"ttl"`
}

func (c *Cache) store(key string, e *Entry) {
	if _, exists := c.hot[key]; !exists {
		if len(c.hot) >= c.maxEntries {
			// Evict oldest
			if len(c.order) > 0 {
				oldest := c.order[0]
				c.order = c.order[1:]
				delete(c.hot, oldest)
			}
		}
		c.order = append(c.order, key)
	}
	c.hot[key] = e
}

func (c *Cache) evict(key string) {
	delete(c.hot, key)
	for i, k := range c.order {
		if k == key {
			c.order = append(c.order[:i], c.order[i+1:]...)
			break
		}
	}
}

func (c *Cache) diskPath(key string) string {
	sum := sha256.Sum256([]byte(key))
	return filepath.Join(c.dir, hex.EncodeToString(sum[:])+".bin")
}
