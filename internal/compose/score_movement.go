package compose

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
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

// writeScoreMovement appends samples until the channel closes or the file
// reaches its bound. It owns the file: nothing else opens it.
func writeScoreMovement(path string, samples <-chan scoreMovementSample, logger *slog.Logger) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		logger.Error("Could not create the directory for score movement samples",
			"path", path, "error", err)
		return
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		logger.Error("Could not open the score movement file; no samples will be recorded",
			"path", path, "error", err)
		return
	}
	defer f.Close()

	size := int64(0)
	if info, err := f.Stat(); err == nil {
		size = info.Size()
	}
	full := false
	enc := json.NewEncoder(f)
	for s := range samples {
		if full {
			continue
		}
		if size >= scoreMovementMaxBytes {
			full = true
			logger.Warn("The score movement file reached its bound; later samples are discarded",
				"path", path, "bytes", size, "written", scoreMovement.written.Load())
			continue
		}
		if err := enc.Encode(s); err != nil {
			logger.Error("Could not append a score movement sample",
				"path", path, "error", err)
			continue
		}
		// Encode writes one line, so the length of the object plus the newline
		// is close enough to bound the file without stat-ing it every time.
		if info, err := f.Stat(); err == nil {
			size = info.Size()
		}
		scoreMovement.written.Add(1)
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
