//go:build linux

package cache

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

// TestSweepPhasesWithAColdPageCache is the same measurement as the scale test
// with the one variable that makes it meaningful: the entries are not in memory.
//
// The scale test wrote 35,000 small entries, about 9MB, so the whole cache sat
// in page cache and every "open" was a memory read at 7µs. Production holds
// 12.9GB across the same file count and competes with renders for that cache,
// so its opens reach the device. The share of the sweep those opens represent is
// what the design turns on, and a cached measurement is the wrong end of it.
//
// fadvise(DONTNEED) drops the pages rather than writing gigabytes to force them
// out, which keeps this a two-second test rather than a disk-filling one.
//
// Run it directly:
//
//	go test ./internal/cache/ -run SweepPhasesWithAColdPageCache -v
func TestSweepPhasesWithAColdPageCache(t *testing.T) {
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

	// Pages must be clean before they can be dropped, so flush first.
	unix.Sync()
	dropped := dropPageCache(t, dir)
	if dropped == 0 {
		t.Fatal("no files had their pages dropped, so this measures the cached case again")
	}

	buf := captureSlog(t, slog.LevelDebug)
	c.sweepWithBounds(entries-271, 1<<40)

	got := lines(buf)
	if len(got) == 0 {
		t.Fatal("the sweep logged nothing")
	}
	rec := got[len(got)-1]
	total := rec["took_ms"].(float64)
	opens := rec["expiry_reads_ms"].(float64)
	files := rec["files"].(float64)

	t.Logf("dropped=%d entries=%.0f took_ms=%.0f readdir_ms=%.0f scan_ms=%.0f expiry_reads_ms=%.0f remove_ms=%.0f",
		dropped, files, total, rec["readdir_ms"], rec["scan_ms"], opens, rec["remove_ms"])
	t.Logf("opens are %.0f%% of the sweep, %.1fµs each", 100*opens/total, opens*1000/float64(entries))
}

// dropPageCache asks the kernel to forget the cached pages of every entry, and
// reports how many it managed. A count of zero means the measurement above is
// the cached one wearing a different name.
func dropPageCache(t *testing.T, dir string) int {
	t.Helper()
	des, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	n := 0
	for _, de := range des {
		if de.IsDir() || filepath.Ext(de.Name()) != ".bin" {
			continue
		}
		f, err := os.Open(filepath.Join(dir, de.Name()))
		if err != nil {
			continue
		}
		if err := unix.Fadvise(int(f.Fd()), 0, 0, unix.FADV_DONTNEED); err == nil {
			n++
		}
		f.Close()
	}
	return n
}
