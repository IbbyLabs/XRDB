package server

import (
	"context"
	"log/slog"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

// A reading with no pipeline and no cache still has to carry the process
// figures, because a partial curve is worth more than a refused sample.
func TestReadMemoryReportsTheProcessWithoutACacheOrPipeline(t *testing.T) {
	s := readMemory(nil, nil)

	if s.HeapInUseBytes == 0 || s.SysBytes == 0 {
		t.Fatalf("process figures are zero: heap %d sys %d", s.HeapInUseBytes, s.SysBytes)
	}
	if s.RatingsEntries != 0 || s.RenderHotBytes != 0 || s.RenderDiskBytes != 0 {
		t.Error("absent sources should report zero rather than a guess")
	}
}

// The reading has to move with real allocation, or the curve it draws is
// decoration. Held live across the second read so it cannot be collected.
func TestReadMemoryTracksAllocation(t *testing.T) {
	before := readMemory(nil, nil)

	held := make([][]byte, 0, 64)
	for i := 0; i < 64; i++ {
		held = append(held, make([]byte, 1<<20))
	}
	after := readMemory(nil, nil)

	if after.HeapInUseBytes <= before.HeapInUseBytes {
		t.Errorf("heap did not grow after 64 MB: before %d after %d", before.HeapInUseBytes, after.HeapInUseBytes)
	}
	runtime.KeepAlive(held)
}

type countingHandler struct {
	mu    sync.Mutex
	lines []string
}

func (h *countingHandler) Enabled(context.Context, slog.Level) bool { return true }
func (h *countingHandler) Handle(_ context.Context, r slog.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.lines = append(h.lines, r.Message)
	return nil
}
func (h *countingHandler) WithAttrs([]slog.Attr) slog.Handler { return h }
func (h *countingHandler) WithGroup(string) slog.Handler      { return h }

func (h *countingHandler) count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, l := range h.lines {
		if strings.HasPrefix(l, "Reporting process memory") {
			n++
		}
	}
	return n
}

// A process that dies before the first tick must still leave one reading.
func TestMemoryReportsWriteOneImmediatelyAndStopWithTheContext(t *testing.T) {
	h := &countingHandler{}
	ctx, cancel := context.WithCancel(context.Background())

	StartMemoryReports(ctx, nil, nil, slog.New(h))

	deadline := time.Now().Add(2 * time.Second)
	for h.count() == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if h.count() == 0 {
		t.Fatal("no reading was written at startup")
	}

	cancel()
	time.Sleep(50 * time.Millisecond)
	after := h.count()
	time.Sleep(150 * time.Millisecond)
	if h.count() != after {
		t.Error("readings continued after the context was cancelled")
	}
}
