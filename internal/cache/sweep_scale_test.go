package cache

import (
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"
)

// TestSweepPhasesAtProductionScale answers the one question the cache design
// turns on: what fraction of a full sweep is the per-file expiry opens.
//
// Production carries ~35,000 entries and its sweeps have run 21ms to 42s. The
// proposals on the table — an in-memory expiry index, or moving expiry out of
// the file — only remove the opens. If the opens are a small share, neither is
// worth building and the time is in the walk, the stats or the deletes.
//
// File size is deliberately not reproduced. Reading an 8-byte header and calling
// stat cost the same whatever the file holds, so the per-file cost this measures
// is size-independent, and 35,000 real-sized entries would be 12GB of disk to
// learn nothing extra. What that does mean: real entries are spread across a
// disk that is also serving renders, so this is the floor for the opens' share
// rather than the production figure.
//
// Skipped under -short. Run it directly:
//
//	go test ./internal/cache/ -run SweepPhasesAtProductionScale -v
func TestSweepPhasesAtProductionScale(t *testing.T) {
	if testing.Short() {
		t.Skip("creates 35,000 files")
	}

	dir := t.TempDir()
	c, err := New(dir, 72*time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	const entries = 35000
	payload := make([]byte, 256)
	for i := 0; i < entries; i++ {
		if err := c.Set(fmt.Sprintf("key-%d", i), payload); err != nil {
			t.Fatalf("Set %d: %v", i, err)
		}
	}

	buf := captureSlog(t, slog.LevelDebug)

	// Production removes a few hundred per sweep, not half the cache, and the
	// deletes are a phase of their own — bounding at half would inflate them and
	// shrink the opens' share by comparison. 271 is its median.
	c.sweepWithBounds(entries-271, 1<<40)

	got := lines(buf)
	if len(got) == 0 {
		t.Fatal("the sweep logged nothing")
	}
	rec := got[len(got)-1]
	total := rec["took_ms"].(float64)
	scan := rec["scan_ms"].(float64)
	opens := rec["expiry_reads_ms"].(float64)
	if total == 0 {
		t.Fatal("the sweep took no measurable time at 35,000 entries")
	}

	t.Logf("entries=%v took_ms=%.0f readdir_ms=%.0f scan_ms=%.0f expiry_reads_ms=%.0f remove_ms=%.0f",
		rec["files"], total, rec["readdir_ms"], scan, opens, rec["remove_ms"])
	t.Logf("opens are %.0f%% of the sweep, %.0f%% of the scan", 100*opens/total, 100*opens/scan)

	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("cache dir vanished: %v", err)
	}
}
