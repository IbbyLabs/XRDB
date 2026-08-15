package cache

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// syncBuffer is the capture target. A Cache starts a sweep goroutine in New, so
// the background sweeper writes to this while the test reads it — an unguarded
// bytes.Buffer is a data race that only shows under -race and only when a test
// happens to overlap a sweep.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// captureSlog swaps the default logger for one writing JSON to a buffer, at the
// given level, and restores it afterwards.
func captureSlog(t *testing.T, level slog.Level) *syncBuffer {
	t.Helper()
	buf := &syncBuffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: level})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return buf
}

func lines(buf *syncBuffer) []map[string]any {
	var out []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if l == "" {
			continue
		}
		var m map[string]any
		if json.Unmarshal([]byte(l), &m) == nil {
			out = append(out, m)
		}
	}
	return out
}

// A sweep that removes nothing and a sweep that never ran are indistinguishable
// unless the sweep says so. This is the whole reason the line exists, so an idle
// pass has to be observable at debug.
func TestAnIdleSweepStillReportsItself(t *testing.T) {
	buf := captureSlog(t, slog.LevelDebug)
	c, err := New(t.TempDir(), time.Minute, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	c.sweepWithBounds(1000, 1<<30)

	got := lines(buf)
	if len(got) == 0 {
		t.Fatal("an idle sweep logged nothing, so a dead sweeper would look identical")
	}
	last := got[len(got)-1]
	if last["evicted"] != float64(0) || last["expired"] != float64(0) {
		t.Errorf("idle sweep reported removals: %v", last)
	}
}

// Being over the bound after a sweep means the sweeper is not keeping up, which
// is the one outcome an operator has to be told about rather than have to go
// looking for.
func TestASweepStillOverItsBoundWarns(t *testing.T) {
	dir := t.TempDir()
	c, err := New(dir, time.Minute, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()
	for i := 0; i < 4; i++ {
		_ = c.Set(string(rune('a'+i)), bytes.Repeat([]byte("x"), 512))
	}

	// The sweep can always reach a bound by deleting more, so the only way it
	// ends over one is when the deletions fail. A read-execute directory still
	// lists and reads but refuses unlink, which is that case.
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o755) })

	buf := captureSlog(t, slog.LevelDebug)
	c.sweepWithBounds(0, 0)

	var warned bool
	for _, l := range lines(buf) {
		if l["level"] == "WARN" {
			warned = true
		}
	}
	if !warned {
		t.Error("a sweep that left the cache over its byte bound did not warn")
	}
}

// The sweep's cost scales with the number of entries, not with what it removes,
// because it opens every file to read the expiry header. Without a duration on
// the line that cost can only be inferred from the entry count.
func TestTheSweepReportsHowLongItTook(t *testing.T) {
	buf := captureSlog(t, slog.LevelDebug)
	c, err := New(t.TempDir(), time.Minute, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	for i := 0; i < 8; i++ {
		if err := c.Set(string(rune('a'+i)), []byte("payload")); err != nil {
			t.Fatalf("Set: %v", err)
		}
	}
	c.sweepWithBounds(1000, 1<<30)

	got := lines(buf)
	if len(got) == 0 {
		t.Fatal("the sweep logged nothing")
	}
	last := got[len(got)-1]
	if _, ok := last["took_ms"]; !ok {
		t.Fatalf("no took_ms on the sweep line: %v", last)
	}
	if v, ok := last["took_ms"].(float64); !ok || v < 0 {
		t.Fatalf("took_ms is not a usable duration: %v", last["took_ms"])
	}
}

// A configured TTL and a byte ceiling both bound the same entries, and the
// ceiling wins without saying so. An operator sizing a disk against
// XRDB_CACHE_TTL_HOURS needs the term entries are actually getting.
func TestASweepThatEvictsReportsTheEffectiveTTL(t *testing.T) {
	buf := captureSlog(t, slog.LevelDebug)
	c, err := New(t.TempDir(), 72*time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	for i := 0; i < 8; i++ {
		if err := c.Set(string(rune('a'+i)), []byte("payload")); err != nil {
			t.Fatalf("Set: %v", err)
		}
	}
	// One sweep is not enough history, so nothing should be derived yet.
	c.sweepWithBounds(3, 1<<30)
	first := lines(buf)
	if len(first) == 0 {
		t.Fatal("the sweep logged nothing")
	}
	if _, ok := first[len(first)-1]["effective_ttl_hours"]; ok {
		t.Fatal("a term was derived from a single sweep")
	}

	// Fill the ring. Entries are re-added so each sweep has something to remove.
	for i := 0; i < removedSamples; i++ {
		for j := 0; j < 8; j++ {
			if err := c.Set(string(rune('a'+j)), []byte("payload")); err != nil {
				t.Fatalf("Set: %v", err)
			}
		}
		c.sweepWithBounds(3, 1<<30)
	}

	got := lines(buf)
	last := got[len(got)-1]
	if _, ok := last["effective_ttl_hours"]; !ok {
		t.Fatalf("no effective_ttl_hours once the ring is full: %v", last)
	}
	if last["sweeps_sampled"] != float64(removedSamples) {
		t.Fatalf("a full ring did not report %d samples: %v", removedSamples, last)
	}
	if _, ok := last["configured_ttl_hours"]; !ok {
		t.Fatalf("the configured TTL was not reported alongside it: %v", last)
	}
}

// Its control: a sweep that removes nothing has no turnover to report, so the
// field must be absent rather than zero.
func TestAnIdleSweepReportsNoEffectiveTTL(t *testing.T) {
	buf := captureSlog(t, slog.LevelDebug)
	c, err := New(t.TempDir(), 72*time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	c.sweepWithBounds(1000, 1<<30)

	got := lines(buf)
	last := got[len(got)-1]
	if _, ok := last["effective_ttl_hours"]; ok {
		t.Fatalf("an idle sweep reported a turnover: %v", last)
	}
}

// The estimator, not the field. A single sweep's removal count ranged 54 to 896
// over six hours on production, so a term derived from the latest one reports
// whichever sweep the reader happened to catch. This is the property the
// field-presence tests above cannot see: they use fixed inputs, so they pass
// whichever estimator is in there.
func TestTheEffectiveTermIgnoresASingleOutlyingSweep(t *testing.T) {
	c, err := New(t.TempDir(), 72*time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	// A steady rate, then one sweep that removes sixteen times as much — the
	// real spread seen on production.
	for i := 0; i < removedSamples-1; i++ {
		if _, _, ok := c.noteRemoved(54, false); ok && i < removedMinSamples-2 {
			t.Fatalf("a term was reported after %d samples", i+1)
		}
	}
	steady, _, ok := c.noteRemoved(54, false)
	if !ok {
		t.Fatal("no term once the ring is full")
	}

	spiked, _, ok := c.noteRemoved(896, false)
	if !ok {
		t.Fatal("no term after the spike")
	}
	if spiked != steady {
		t.Fatalf("one outlying sweep moved the estimate from %d to %d", steady, spiked)
	}
}

// Its control: a sustained change must move it, or the test above would pass on
// an estimator that returns a constant.
func TestTheEffectiveTermFollowsASustainedChange(t *testing.T) {
	c, err := New(t.TempDir(), 72*time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	for i := 0; i < removedSamples; i++ {
		c.noteRemoved(54, false)
	}
	steady, _, _ := c.noteRemoved(54, false)

	for i := 0; i < removedSamples; i++ {
		c.noteRemoved(896, false)
	}
	moved, _, ok := c.noteRemoved(896, false)
	if !ok {
		t.Fatal("no term after the sustained change")
	}
	if moved == steady {
		t.Fatalf("a sustained change did not move the estimate from %d", steady)
	}
}

// The reported sample count has to vary, or it is a constant dressed as a depth
// indicator: an operator seeing it would reasonably read a low value as "thin
// history, do not trust this yet", and it must be able to say that.
func TestTheReportedSampleCountGrowsWithHistory(t *testing.T) {
	c, err := New(t.TempDir(), 72*time.Hour, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	var seen []int
	for i := 0; i < removedSamples+2; i++ {
		_, samples, ok := c.noteRemoved(54, false)
		if ok {
			seen = append(seen, samples)
		}
	}
	if len(seen) == 0 {
		t.Fatal("nothing was ever reported")
	}
	if seen[0] != removedMinSamples {
		t.Fatalf("first report used %d samples, want %d", seen[0], removedMinSamples)
	}
	if seen[len(seen)-1] != removedSamples {
		t.Fatalf("last report used %d samples, want the full ring of %d", seen[len(seen)-1], removedSamples)
	}
	if seen[0] == seen[len(seen)-1] {
		t.Fatal("the sample count never changed, so it cannot signal thin history")
	}
}

// A single total cannot say where a 29-second sweep went. The phases have to be
// separable or the fix gets aimed at whichever part was assumed.
func TestTheSweepAttributesItsTime(t *testing.T) {
	buf := captureSlog(t, slog.LevelDebug)
	c, err := New(t.TempDir(), time.Minute, 10, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	// Enough entries that the phases take measurable time. At eight files every
	// phase rounds to zero and the arithmetic below cannot fail, which makes it
	// decoration rather than a check.
	for i := 0; i < 3000; i++ {
		if err := c.Set(fmt.Sprintf("k%d", i), []byte("payload")); err != nil {
			t.Fatalf("Set: %v", err)
		}
	}
	c.sweepWithBounds(10, 1<<30)

	got := lines(buf)
	last := got[len(got)-1]
	if last["took_ms"].(float64) == 0 {
		t.Fatal("the sweep took no measurable time, so the arithmetic below proves nothing")
	}
	for _, field := range []string{"readdir_ms", "scan_ms", "expiry_reads_ms", "remove_ms"} {
		if _, ok := last[field]; !ok {
			t.Fatalf("no %s on the sweep line: %v", field, last)
		}
	}
	// The parts cannot exceed the whole. A phase timer started in the wrong place
	// shows up here rather than as a plausible-looking number in production.
	total := last["took_ms"].(float64)
	parts := last["readdir_ms"].(float64) + last["scan_ms"].(float64) + last["remove_ms"].(float64)
	if parts > total+1 {
		t.Fatalf("phases sum to %.0fms against a %.0fms total", parts, total)
	}
	// The expiry reads happen inside the scan, so they cannot exceed it.
	if last["expiry_reads_ms"].(float64) > last["scan_ms"].(float64)+1 {
		t.Fatalf("expiry reads %.0fms exceed the scan they happen inside, %.0fms",
			last["expiry_reads_ms"], last["scan_ms"])
	}
}

// files_at_scan and unread_at_scan are the pair anyone will divide, so they
// have to describe one population. files is recounted after the removals and
// picks up entries written during the sweep, which is why it cannot be the
// denominator.
func TestTheUnreadRatioHasOnePopulation(t *testing.T) {
	buf := captureSlog(t, slog.LevelDebug)

	c, err := New(t.TempDir(), time.Hour, 200, 1<<20)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer c.Close()

	for i := 0; i < 30; i++ {
		if err := c.Set(fmt.Sprintf("k%d", i), []byte("v")); err != nil {
			t.Fatalf("Set: %v", err)
		}
	}
	for i := 0; i < 10; i++ {
		if _, ok := c.Get(fmt.Sprintf("k%d", i)); !ok {
			t.Fatalf("Get k%d: miss", i)
		}
	}
	// Below the number of unread entries, so a count taken after the removals
	// would come out under unread_at_scan — the shape of the real defect.
	c.sweepWithBounds(15, 1<<30)

	line := buf.String()
	scanned := logInt(t, line, "files_at_scan")
	unread := logInt(t, line, "unread_at_scan")
	if scanned == 0 {
		t.Fatalf("no files_at_scan in the sweep line, so the ratio cannot be checked; line was: %s", line)
	}
	if unread > scanned {
		t.Errorf("unread_at_scan %d exceeds files_at_scan %d, so the pair is not one population", unread, scanned)
	}
	if unread == scanned {
		t.Errorf("unread_at_scan equals files_at_scan (%d) despite ten reads, so reads are not reflected", unread)
	}
}

func logInt(t *testing.T, line, key string) int {
	t.Helper()
	// The startup pass logs first; the sweep under test is the last line.
	all := regexp.MustCompile(`"`+key+`":(\d+)`).FindAllStringSubmatch(line, -1)
	if len(all) == 0 {
		return 0
	}
	m := all[len(all)-1]
	n, err := strconv.Atoi(m[1])
	if err != nil {
		t.Fatalf("parsing %s: %v", key, err)
	}
	return n
}
