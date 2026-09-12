package compose

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// collectScoreMovement points the recorder at a test channel and returns what
// arrives. The recorder is package state, so it is restored afterwards.
func collectScoreMovement(t *testing.T) func() []scoreMovementSample {
	t.Helper()
	ch := make(chan scoreMovementSample, 32)
	scoreMovement.mu.Lock()
	prev := scoreMovement.samples
	scoreMovement.samples = ch
	scoreMovement.mu.Unlock()
	t.Cleanup(func() {
		scoreMovement.mu.Lock()
		scoreMovement.samples = prev
		scoreMovement.mu.Unlock()
	})
	return func() []scoreMovementSample {
		var got []scoreMovementSample
		for {
			select {
			case s := <-ch:
				got = append(got, s)
			default:
				return got
			}
		}
	}
}

func ratingOf(source string, value float64) *provider.MediaMeta {
	return &provider.MediaMeta{Ratings: []provider.Rating{{Source: source, Value: value}}}
}

// FR-210. Replacing an expired entry is the one moment both scores and the
// interval between them are in hand, and nothing recorded it. Asserted through
// storeLocked rather than the sampler, because the sampler passing while the
// call site does not reach it is the failure this is built to avoid.
func TestReplacingAnExpiredEntryRecordsHowFarTheScoreMoved(t *testing.T) {
	drain := collectScoreMovement(t)
	c := newRatingsCache(time.Hour, nil)
	key := provider.GoodKey("imdb", "poster", "tt1")

	c.mu.Lock()
	c.storeLocked(key, ratingOf("imdb", 8.1), true, titleAge{year: 1994})
	// Age the entry so the interval is a real one rather than zero.
	e := c.entries[key]
	e.ExpiresAt = time.Now().Add(-time.Minute)
	e.TTL = 2 * time.Hour
	c.entries[key] = e
	c.storeLocked(key, ratingOf("imdb", 8.4), true, titleAge{year: 1994})
	c.mu.Unlock()

	got := drain()
	if len(got) != 1 {
		t.Fatalf("recorded %d samples, want 1", len(got))
	}
	s := got[0]
	if s.Old != 8.1 || s.New != 8.4 {
		t.Errorf("sample has old=%v new=%v, want 8.1 and 8.4", s.Old, s.New)
	}
	if s.Year != 1994 {
		t.Errorf("year = %d, want 1994", s.Year)
	}
	if s.Rating != "imdb" || s.MediaID != "tt1" {
		t.Errorf("sample names rating %q media %q, want imdb and tt1", s.Rating, s.MediaID)
	}
	if s.HeldMs <= 0 || s.TermMs != (2*time.Hour).Milliseconds() {
		t.Errorf("held=%dms term=%dms, want a positive interval and the stored term", s.HeldMs, s.TermMs)
	}
}

// The control. A first store has nothing to compare against, so a sample here
// would mean the recorder is inventing intervals rather than measuring them.
func TestAFirstStoreRecordsNothing(t *testing.T) {
	drain := collectScoreMovement(t)
	c := newRatingsCache(time.Hour, nil)

	c.mu.Lock()
	c.storeLocked(provider.GoodKey("imdb", "poster", "tt2"), ratingOf("imdb", 7.0), true, titleAge{year: 2001})
	c.mu.Unlock()

	if got := drain(); len(got) != 0 {
		t.Errorf("recorded %d samples with no previous entry, want none: %+v", len(got), got)
	}
}

// A source that started or stopped answering says nothing about movement, and
// counting it as a move from zero would be the largest samples in the file.
func TestASourceAppearingOrVanishingIsNotAMovement(t *testing.T) {
	drain := collectScoreMovement(t)
	c := newRatingsCache(time.Hour, nil)
	key := provider.GoodKey("mdblist", "poster", "tt3")

	c.mu.Lock()
	c.storeLocked(key, ratingOf("imdb", 6.5), true, titleAge{year: 2010})
	e := c.entries[key]
	e.ExpiresAt = time.Now().Add(-time.Minute)
	e.TTL = time.Hour
	c.entries[key] = e
	// A different rating source in the replacement, so neither side pairs up.
	c.storeLocked(key, ratingOf("tmdb", 7.2), true, titleAge{year: 2010})
	c.mu.Unlock()

	if got := drain(); len(got) != 0 {
		t.Errorf("recorded %d samples for a source that appeared, want none: %+v", len(got), got)
	}
}

// storeLocked holds the cache mutex on the render path, so a full queue has to
// cost a sample rather than a stalled render.
func TestAFullQueueDropsRatherThanBlocks(t *testing.T) {
	ch := make(chan scoreMovementSample) // unbuffered, nothing reading
	scoreMovement.mu.Lock()
	prev := scoreMovement.samples
	scoreMovement.samples = ch
	scoreMovement.mu.Unlock()
	t.Cleanup(func() {
		scoreMovement.mu.Lock()
		scoreMovement.samples = prev
		scoreMovement.mu.Unlock()
	})

	before := scoreMovement.dropped.Load()
	done := make(chan struct{})
	go func() {
		recordScoreMovement(scoreMovementSample{Rating: "imdb"})
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("recording blocked on a queue nothing is reading")
	}
	if scoreMovement.dropped.Load() != before+1 {
		t.Errorf("dropped count %d, want %d", scoreMovement.dropped.Load(), before+1)
	}
}

// The samples have to outlive the container log, which retains well under an
// hour at production volume while the multipliers need a week. So the writer is
// asserted to put them on disk rather than only onto a channel.
// sampleLines returns the sample lines of a recorder file, dropping the run
// marks. A mark carries an event and no source.
func sampleLines(t *testing.T, data []byte) []string {
	t.Helper()
	var out []string
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if line == "" {
			continue
		}
		var row map[string]any
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			t.Fatalf("line is not JSON: %q", line)
		}
		if row["event"] != nil && row["source"] == nil {
			continue
		}
		out = append(out, line)
	}
	return out
}

func TestSamplesAreWrittenToDiskAsOneJSONObjectPerLine(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, scoreMovementFile)
	ch := make(chan scoreMovementSample, 4)
	done := make(chan struct{})
	go func() {
		writeScoreMovement(path, ch, slog.New(slog.NewTextHandler(io.Discard, nil)))
		close(done)
	}()

	ch <- scoreMovementSample{Rating: "imdb", MediaID: "tt1", Old: 8.1, New: 8.4, Year: 1994}
	ch <- scoreMovementSample{Rating: "tmdb", MediaID: "tt2", Old: 7.0, New: 7.0, Year: 2001}
	close(ch)
	<-done

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("no file was written: %v", err)
	}
	// The writer marks each run before any sample, so a reader of this file
	// counts samples by skipping marks rather than by counting lines.
	lines := sampleLines(t, data)
	if len(lines) != 2 {
		t.Fatalf("wrote %d samples, want 2: %q", len(lines), string(data))
	}
	var first scoreMovementSample
	if err := json.Unmarshal([]byte(lines[0]), &first); err != nil {
		t.Fatalf("line 1 is not one JSON object: %v", err)
	}
	if first.Old != 8.1 || first.New != 8.4 || first.MediaID != "tt1" {
		t.Errorf("line 1 = %+v, want the first sample", first)
	}
}

// A second run appends rather than truncating, so a restart does not discard
// the days already collected.
func TestARestartAppendsRatherThanTruncating(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, scoreMovementFile)
	quiet := slog.New(slog.NewTextHandler(io.Discard, nil))

	for _, id := range []string{"tt1", "tt2"} {
		ch := make(chan scoreMovementSample, 1)
		done := make(chan struct{})
		go func() { writeScoreMovement(path, ch, quiet); close(done) }()
		ch <- scoreMovementSample{Rating: "imdb", MediaID: id, Old: 1, New: 2}
		close(ch)
		<-done
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if lines := sampleLines(t, data); len(lines) != 2 {
		t.Errorf("after two runs the file holds %d samples, want 2: %q", len(lines), string(data))
	}
}

// An instance that did not ask to record gets nothing: no file, no goroutine,
// no cost. The recorder is opt-in because the samples answer a question about
// this project rather than about anyone's own instance, and they never leave the
// disk they are written on.
func TestNothingIsRecordedWhenTheInstanceDidNotAskForIt(t *testing.T) {
	scoreMovement.mu.Lock()
	prev := scoreMovement.samples
	scoreMovement.samples = nil
	scoreMovement.mu.Unlock()
	t.Cleanup(func() {
		scoreMovement.mu.Lock()
		scoreMovement.samples = prev
		scoreMovement.mu.Unlock()
	})

	before := scoreMovement.dropped.Load()
	c := newRatingsCache(time.Hour, nil)
	key := provider.GoodKey("imdb", "poster", "tt9")
	c.mu.Lock()
	c.storeLocked(key, ratingOf("imdb", 5.0), true, titleAge{year: 1999})
	e := c.entries[key]
	e.ExpiresAt = time.Now().Add(-time.Minute)
	e.TTL = time.Hour
	c.entries[key] = e
	c.storeLocked(key, ratingOf("imdb", 5.5), true, titleAge{year: 1999})
	c.mu.Unlock()

	if scoreMovement.dropped.Load() != before {
		t.Errorf("an instance that never opted in counted %d drops, want none",
			scoreMovement.dropped.Load()-before)
	}
}

// SetScoreMovementPath with no directory leaves it off rather than writing
// beside the binary.
func TestAnEmptyDirectoryLeavesRecordingOff(t *testing.T) {
	scoreMovement.mu.Lock()
	prev := scoreMovement.samples
	scoreMovement.samples = nil
	scoreMovement.mu.Unlock()
	t.Cleanup(func() {
		scoreMovement.mu.Lock()
		scoreMovement.samples = prev
		scoreMovement.mu.Unlock()
	})

	SetScoreMovementPath("", true, nil)
	scoreMovement.mu.Lock()
	started := scoreMovement.samples != nil
	scoreMovement.mu.Unlock()
	if started {
		t.Error("recording started with no directory to write into")
	}
}

// The gate itself, rather than the state behind it. An earlier version guarded
// the call site instead, so deleting the guard left every test passing: they
// simulated "off" by clearing the channel and never exercised the decision.
func TestRecordingStaysOffUntilTheInstanceAsks(t *testing.T) {
	scoreMovement.mu.Lock()
	prev := scoreMovement.samples
	scoreMovement.samples = nil
	scoreMovement.mu.Unlock()
	t.Cleanup(func() {
		scoreMovement.mu.Lock()
		scoreMovement.samples = prev
		scoreMovement.mu.Unlock()
	})

	SetScoreMovementPath(t.TempDir(), false, nil)
	scoreMovement.mu.Lock()
	started := scoreMovement.samples != nil
	scoreMovement.mu.Unlock()
	if started {
		t.Fatal("recording started on an instance that did not ask for it")
	}

	// The control: a usable directory with the instance asking does start it, so
	// the refusal above is the flag rather than the path being unusable.
	//
	// Its own directory rather than t.TempDir, because the writer goroutine has
	// no stop and outlives the test. Go's own cleanup fails on a directory it
	// is still writing into; os.RemoveAll does not care.
	dir, err := os.MkdirTemp("", "score-movement-gate")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	SetScoreMovementPath(dir, true, nil)
	scoreMovement.mu.Lock()
	started = scoreMovement.samples != nil
	scoreMovement.mu.Unlock()
	if !started {
		t.Error("control: recording did not start when asked, so the refusal proves nothing")
	}
}


// A reader has to tell a quiet stretch from one where the process died with
// samples still queued, and only the file can say which it was.
func TestScoreMovementFileMarksWhereRecordingRestarted(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, scoreMovementFile)

	for run := 0; run < 2; run++ {
		samples := make(chan scoreMovementSample, 1)
		done := make(chan struct{})
		go func() {
			writeScoreMovement(path, samples, slog.New(slog.NewTextHandler(io.Discard, nil)))
			close(done)
		}()
		samples <- scoreMovementSample{At: time.Now().UTC(), Source: "tmdb", Rating: "8.1", MediaID: "tt1", Old: 8.0, New: 8.1}
		close(samples)
		<-done
	}

	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read the file: %v", err)
	}
	var markers, samples int
	for _, line := range strings.Split(strings.TrimSpace(string(body)), "\n") {
		var row map[string]any
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			t.Fatalf("line is not JSON: %q", line)
		}
		if row["event"] == "recorder-start" {
			markers++
			if _, ok := row["source"]; ok {
				t.Error("a marker carries a source, so a reader cannot tell it from a sample")
			}
			continue
		}
		if row["source"] == nil {
			t.Errorf("a line is neither marker nor sample: %q", line)
		}
		samples++
	}
	// Two runs, so two marks and two samples, and the first mark comes first.
	if markers != 2 || samples != 2 {
		t.Fatalf("markers = %d, samples = %d, want 2 and 2", markers, samples)
	}
	if !strings.HasPrefix(strings.TrimSpace(string(body)), `{"at":`) {
		t.Error("the file does not start with the first run's mark")
	}
}

// A file at its bound is renamed aside and recording continues into a fresh
// one, so a week's collection does not end the recorder for the life of the
// process. A restart alone would not do it: the writer reopens the same file,
// sees it at the bound, and stops again.
func TestAFileAtItsBoundIsRotatedAndRecordingContinues(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, scoreMovementFile)
	quiet := slog.New(slog.NewTextHandler(io.Discard, nil))
	restore := scoreMovementBound
	scoreMovementBound = 400 // a run mark plus a few samples
	t.Cleanup(func() { scoreMovementBound = restore })

	ch := make(chan scoreMovementSample, 16)
	done := make(chan struct{})
	go func() { writeScoreMovement(path, ch, quiet); close(done) }()
	for i := range 8 {
		ch <- scoreMovementSample{Rating: "imdb", MediaID: fmt.Sprintf("tt%d", i), Old: 1, New: 2}
	}
	close(ch)
	<-done

	rotated, _ := filepath.Glob(path + ".*")
	if len(rotated) == 0 {
		t.Fatal("the file reached its bound and nothing was rotated aside")
	}
	total := 0
	for _, p := range append(rotated, path) {
		data, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		total += len(sampleLines(t, data))
	}
	if total != 8 {
		t.Errorf("%d samples survive across the live and rotated files, want 8", total)
	}
	live, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(sampleLines(t, live)) == 0 {
		t.Error("the live file holds no samples after rotation, so recording did not continue")
	}
	if int64(len(live)) >= scoreMovementBound {
		t.Errorf("the live file is %d bytes, at or past the bound of %d", len(live), scoreMovementBound)
	}
}

// Rotated files are bounded too, or a recorder that outlives its purpose fills
// the disk one rename at a time, which is the thing the bound exists to stop.
func TestOnlyTheNewestRotatedFilesAreKept(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, scoreMovementFile)
	for i := range 6 {
		old := fmt.Sprintf("%s.2026010%dT000000Z", path, i)
		if err := os.WriteFile(old, []byte("{}\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	quiet := slog.New(slog.NewTextHandler(io.Discard, nil))
	restore := scoreMovementBound
	scoreMovementBound = 200
	t.Cleanup(func() { scoreMovementBound = restore })

	ch := make(chan scoreMovementSample, 8)
	done := make(chan struct{})
	go func() { writeScoreMovement(path, ch, quiet); close(done) }()
	for i := range 4 {
		ch <- scoreMovementSample{Rating: "imdb", MediaID: fmt.Sprintf("tt%d", i), Old: 1, New: 2}
	}
	close(ch)
	<-done

	rotated, _ := filepath.Glob(path + ".*")
	if len(rotated) > scoreMovementKeep {
		t.Errorf("%d rotated files remain, want at most %d: %v", len(rotated), scoreMovementKeep, rotated)
	}
	// One rotation removes the oldest three of six, so the two oldest must be
	// gone whatever the exact count of rotations.
	for _, gone := range []string{".20260100T", ".20260101T"} {
		for _, p := range rotated {
			if strings.Contains(p, gone) {
				t.Errorf("the oldest rotated file survived while newer ones were pruned: %s", p)
			}
		}
	}
	newest := 0
	for _, p := range rotated {
		if !strings.Contains(p, ".2026010") {
			newest++
		}
	}
	if newest == 0 {
		t.Errorf("no freshly rotated file survives the prune: %v", rotated)
	}
}
