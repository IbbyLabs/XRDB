package compose

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

// countTimingRecords renders n breakdowns through a logger fixed at info and
// reports how many came out.
func countTimingRecords(t *testing.T, sample, n int) int {
	t.Helper()
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	SetRenderTimingSample(sample)
	t.Cleanup(func() { SetRenderTimingSample(0) })

	for i := 0; i < n; i++ {
		tm := newRenderTimings()
		tm.mark("artwork")
		tm.log(context.Background(), logger, Request{MediaType: "poster", MediaID: "tt1"})
	}

	count := 0
	for _, line := range strings.Split(buf.String(), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var rec map[string]any
		if json.Unmarshal([]byte(line), &rec) == nil && rec["msg"] == "Composed a render" {
			count++
		}
	}
	return count
}

// Unset, the breakdown stays at debug and an info logger shows nothing. This is
// the behaviour every existing instance has.
func TestWithoutASampleNothingIsReportedAtInfo(t *testing.T) {
	if got := countTimingRecords(t, 0, 50); got != 0 {
		t.Fatalf("%d records at info with sampling off", got)
	}
}

// The control for the test above: without it, a sampler that never emits would
// pass by reporting nothing for the same reason.
func TestASampleReportsAtInfo(t *testing.T) {
	if got := countTimingRecords(t, 10, 100); got == 0 {
		t.Fatal("no records at info with sampling on, so the test above proves nothing")
	}
}

// Drawn at random, so the count is near one in n rather than exactly it. Over
// 20,000 renders at 1-in-100 the expected 200 sits far outside the range either
// a never-fires or an always-fires sampler would produce.
func TestTheSampleRateIsNearOneInN(t *testing.T) {
	const renders, rate = 20000, 100
	got := countTimingRecords(t, rate, renders)
	expected := renders / rate
	if got < expected/2 || got > expected*2 {
		t.Fatalf("one in %d over %d renders gave %d records, expected near %d",
			rate, renders, got, expected)
	}
}

// A sample of 1 would mean every render, which is the volume this exists to
// avoid. It is treated as off.
func TestASampleOfOneIsTreatedAsOff(t *testing.T) {
	if got := countTimingRecords(t, 1, 20); got != 0 {
		t.Fatalf("%d records at info for a sample of 1", got)
	}
}
