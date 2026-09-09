package server

import (
	"context"
	"log/slog"
	"runtime"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
)

// FR-XXX. On 2026-09-09 the kernel killed this process at 11.2 GB and nothing
// had recorded its memory over time, so the growth had an endpoint and no
// curve. Every theory about the cause was unfalsifiable. This writes the curve.
//
// Four figures rather than two: heap and RSS say it grew, the two cache sizes
// say what grew. A jump in heap with flat caches is a different fault from one
// that tracks them.

// memoryReportInterval is the sampling clock. Fixed rather than driven by
// request activity: a quiet hour must read as a flat curve that was measured,
// not as an absence of measurements.
const memoryReportInterval = time.Minute

// memorySample is the reading, separated from the logging so a test can assert
// on the numbers rather than on a log line.
type memorySample struct {
	HeapInUseBytes  uint64
	HeapObjects     uint64
	SysBytes        uint64
	RatingsEntries  int
	RenderHotBytes  int64
	RenderDiskBytes int64
}

// readMemory takes one reading. A nil pipeline or cache reports zero for its
// own fields rather than refusing the whole sample: a partial curve beats none.
func readMemory(pipeline *compose.Pipeline, renderCache *cache.Cache) memorySample {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	s := memorySample{
		HeapInUseBytes: ms.HeapInuse,
		HeapObjects:    ms.HeapObjects,
		// Sys is what the process has taken from the OS, which is the figure
		// the kernel's OOM killer acts on rather than heap in use.
		SysBytes: ms.Sys,
	}
	if pipeline != nil {
		s.RatingsEntries = pipeline.CachedRatings()
	}
	if renderCache != nil {
		st := renderCache.Stats()
		s.RenderHotBytes = st.HotBytes
		s.RenderDiskBytes = st.DiskBytes
	}
	return s
}

// StartMemoryReports logs one memory reading a minute until ctx is done.
func StartMemoryReports(ctx context.Context, pipeline *compose.Pipeline, renderCache *cache.Cache, logger *slog.Logger) {
	if logger == nil {
		logger = slog.Default()
	}
	go func() {
		ticker := time.NewTicker(memoryReportInterval)
		defer ticker.Stop()
		report := func() {
			s := readMemory(pipeline, renderCache)
			logger.Info("Reporting process memory and what is held in it",
				"heap_in_use_mb", s.HeapInUseBytes>>20,
				"heap_objects", s.HeapObjects,
				"sys_mb", s.SysBytes>>20,
				"ratings_entries", s.RatingsEntries,
				"render_hot_mb", s.RenderHotBytes>>20,
				"render_disk_mb", s.RenderDiskBytes>>20)
		}
		// One at startup, so a process that dies before the first tick still
		// leaves a reading to compare against.
		report()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				report()
			}
		}
	}()
}
