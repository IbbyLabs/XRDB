package cache

import (
	"sync"
	"testing"
	"time"
)

// BUG-201: SetDiskBounds writes maxDiskFiles/maxDiskBytes under the lock, but a
// sweep read them without it, so raising the limits while the cache was evicting
// was a data race. Only -race fails on this; the values themselves stay
// plausible, which is why it went unnoticed.
func TestDiskBoundsAreSafeToChangeDuringASweep(t *testing.T) {
	c, err := New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)

	// Something on disk for the sweep to walk.
	for i := 0; i < 20; i++ {
		if err := c.Set(string(rune('a'+i%26))+"-key", []byte("payload")); err != nil {
			t.Fatal(err)
		}
	}

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 2000; i++ {
			c.SetDiskBounds(50+i%50, int64(1<<20)+int64(i))
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			c.sweep()
			_ = c.DiskBounds()
		}
	}()

	// Purge reads the bounds after releasing the lock, which was the second site.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 20; i++ {
			c.Purge()
		}
	}()

	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		t.Fatal("timed out")
	}
}
