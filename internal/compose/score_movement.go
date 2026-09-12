package compose

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"xrdb_rewrite/internal/provider"
)

// FR-210. The cache's age tiers decide how long a rating is kept, and the
// multipliers in that table are sized to fit the entry cap while the cap is
// sized to fit the multipliers. Neither is anchored to how fast a score actually
// moves, and nothing has ever recorded that.
//
// The sample is already in hand and thrown away: when an expired entry is
// replaced, the previous score, the new one, how long the old one was held and
// the title's year are all present at once, and the fetch has happened anyway.
// This writes them down. It changes no term and decides nothing; deriving the
// multipliers is a separate piece of work that needs a week of these first.

// scoreMovementFile is where samples are appended, under the cache directory so
// they survive a restart. Newline-delimited JSON, one object per rating.
const scoreMovementFile = "score-movement.ndjson"

// scoreMovementMaxBytes bounds the file. At roughly 200 bytes a sample this
// holds about 300,000 of them, well past the week the multipliers need, and it
// cannot fill a disk if the write outlives its purpose.
const scoreMovementMaxBytes = 64 << 20

// scoreMovementBound is the bound in force. A variable so a test can reach the
// rotation without writing 64 MiB.
var scoreMovementBound int64 = scoreMovementMaxBytes

// scoreMovementKeep is how many rotated files are kept beside the live one.
const scoreMovementKeep = 4

// scoreMovementQueue is how many samples may wait to be written. storeLocked
// runs under the cache mutex on the render path, so it must never wait on a
// file. Past this depth samples are dropped and counted rather than queued.
const scoreMovementQueue = 4096

// scoreMovementSample is one observation of a score over a known interval.
type scoreMovementSample struct {
	At          time.Time `json:"at"`
	Source      string    `json:"source"`
	Rating      string    `json:"rating"`
	ContentType string    `json:"contentType,omitempty"`
	MediaID     string    `json:"mediaId"`
	Year        int       `json:"year,omitempty"`
	HeldMs      int64     `json:"heldMs"`
	TermMs      int64     `json:"termMs"`
	Old         float64   `json:"old"`
	New         float64   `json:"new"`
}

// scoreMovementMarker records that recording (re)started, so a reader can
// exclude the minutes either side of a restart rather than reading a gap as
// stillness. Samples carry a source; this does not.
type scoreMovementMarker struct {
	At    time.Time `json:"at"`
	Event string    `json:"event"`
}

var scoreMovement struct {
	mu      sync.Mutex
	samples chan scoreMovementSample
	dropped atomic.Int64
	written atomic.Int64
	log     *slog.Logger
}

// SetScoreMovementPath starts recording score movement into dir when the
// instance asked for it. An instance that did not, or that has no cache
// directory, records nothing rather than carrying a file it will never read.
//
// The enabled check lives here rather than at the call site so that it is the
// tested function that owns it. Guarding the call instead left a version where
// deleting the guard passed every test, because the tests reached past it.
func SetScoreMovementPath(dir string, enabled bool, logger *slog.Logger) {
	if !enabled || dir == "" {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	scoreMovement.mu.Lock()
	defer scoreMovement.mu.Unlock()
	if scoreMovement.samples != nil {
		return
	}
	scoreMovement.log = logger
	scoreMovement.samples = make(chan scoreMovementSample, scoreMovementQueue)
	path := filepath.Join(dir, scoreMovementFile)
	go writeScoreMovement(path, scoreMovement.samples, logger)
	logger.Info("Recording how far cached scores move between refetches",
		"path", path, "max_bytes", scoreMovementMaxBytes)
}

// writeScoreMovement appends samples until the channel closes. A file at its
// bound is moved aside and a fresh one opened, so a week's collection does not
// end the recorder. It owns the file: nothing else opens it.
func writeScoreMovement(path string, samples <-chan scoreMovementSample, logger *slog.Logger) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		logger.Error("Could not create the directory for score movement samples",
			"path", path, "error", err)
		return
	}
	f, err := openScoreMovement(path)
	if err != nil {
		logger.Error("Could not open the score movement file; no samples will be recorded",
			"path", path, "error", err)
		return
	}
	defer func() { _ = f.Close() }()

	enc := json.NewEncoder(f)
	// A process that dies loses whatever is queued, so a reader cannot tell a
	// quiet minute from a lost one. This line marks where the record broke.
	// It carries no source, which is how a reader tells it from a sample.
	size := markScoreMovementRun(f, enc, "recorder-start", path, logger)
	full := false
	for s := range samples {
		if full {
			continue
		}
		if size >= scoreMovementBound {
			fresh, err := rotateScoreMovement(f, path)
			if err != nil {
				full = true
				logger.Error("Could not rotate the score movement file; later samples are discarded",
					"path", path, "bytes", size, "written", scoreMovement.written.Load(),
					"dropped", scoreMovement.dropped.Load(), "error", err)
				continue
			}
			logger.Info("The score movement file reached its bound and was rotated",
				"path", path, "bytes", size, "written", scoreMovement.written.Load(),
				"dropped", scoreMovement.dropped.Load())
			f = fresh
			enc = json.NewEncoder(f)
			size = markScoreMovementRun(f, enc, "recorder-rotate", path, logger)
		}
		if err := enc.Encode(s); err != nil {
			logger.Error("Could not append a score movement sample",
				"path", path, "error", err)
			continue
		}
		// Encode writes one line, so the length of the object plus the newline
		// is close enough to bound the file without stat-ing it every time.
		size = scoreMovementSize(f, size)
		scoreMovement.written.Add(1)
	}
}

func openScoreMovement(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
}

func scoreMovementSize(f *os.File, fallback int64) int64 {
	if info, err := f.Stat(); err == nil {
		return info.Size()
	}
	return fallback
}

// markScoreMovementRun writes the line that says recording (re)started here and
// returns the file's size after it.
func markScoreMovementRun(f *os.File, enc *json.Encoder, event, path string, logger *slog.Logger) int64 {
	if err := enc.Encode(scoreMovementMarker{At: time.Now().UTC(), Event: event}); err != nil {
		logger.Error("Could not mark the start of a score movement run",
			"path", path, "event", event, "error", err)
	}
	return scoreMovementSize(f, 0)
}

// rotateScoreMovement moves the file at path aside under a timestamped name,
// opens a fresh one at path and prunes rotated files past scoreMovementKeep.
// The rename happens before the close, so a rename that fails leaves f usable.
func rotateScoreMovement(f *os.File, path string) (*os.File, error) {
	aside := path + "." + time.Now().UTC().Format("20060102T150405.000000000Z")
	if err := os.Rename(path, aside); err != nil {
		return nil, err
	}
	_ = f.Close()
	fresh, err := openScoreMovement(path)
	if err != nil {
		return nil, err
	}
	pruneScoreMovement(path)
	return fresh, nil
}

// pruneScoreMovement removes the oldest rotated files past scoreMovementKeep.
// Names sort by their timestamp, so lexical order is age order.
func pruneScoreMovement(path string) {
	rotated, err := filepath.Glob(path + ".*")
	if err != nil || len(rotated) <= scoreMovementKeep {
		return
	}
	sort.Strings(rotated)
	for _, old := range rotated[:len(rotated)-scoreMovementKeep] {
		_ = os.Remove(old)
	}
}

// recordScoreMovement queues one sample. Never blocks: it is called with the
// cache mutex held, so a slow disk must cost a dropped sample rather than a
// stalled render.
func recordScoreMovement(s scoreMovementSample) {
	scoreMovement.mu.Lock()
	ch := scoreMovement.samples
	scoreMovement.mu.Unlock()
	if ch == nil {
		return
	}
	select {
	case ch <- s:
	default:
		scoreMovement.dropped.Add(1)
	}
}

// ScoreMovementCounts reports samples written and dropped, for the admin
// surface and so a reading of the file can say what share of the truth it holds.
func ScoreMovementCounts() (written, dropped int64) {
	return scoreMovement.written.Load(), scoreMovement.dropped.Load()
}

// sampleScoreMovement turns a replaced entry and its replacement into one sample
// per rating both of them carry.
//
// A rating present in only one of the two is skipped: it says a source started
// or stopped answering, not how far a score moved. A zero value is skipped for
// the same reason.
func sampleScoreMovement(key string, prev ratingsEntry, meta *provider.MediaMeta, age titleAge) {
	held := time.Since(prev.ExpiresAt.Add(-prev.TTL))
	if held <= 0 || meta == nil || prev.Meta == nil {
		return
	}
	before := make(map[string]float64, len(prev.Meta.Ratings))
	for _, r := range prev.Meta.Ratings {
		before[r.Source] = r.Value
	}
	source, contentType, id := provider.SplitGoodKey(key)
	now := time.Now().UTC()
	for _, r := range meta.Ratings {
		old, ok := before[r.Source]
		if !ok || old == 0 || r.Value == 0 {
			continue
		}
		recordScoreMovement(scoreMovementSample{
			At: now, Source: source, Rating: r.Source, ContentType: contentType,
			MediaID: id, Year: age.year, HeldMs: held.Milliseconds(),
			TermMs: prev.TTL.Milliseconds(), Old: old, New: r.Value,
		})
	}
}
