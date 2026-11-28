package provider

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"xrdb_rewrite/internal/logging"
)

// mdblistBulkQuietMinutes is how many minutes from the top of each UTC hour
// sweep lookups leave MDBList alone. 0 turns the window off.
func mdblistBulkQuietMinutes() int {
	return envInt("XRDB_MDBLIST_BULK_QUIET_MINUTES", 2, 0, 10)
}

// pacedByTopOfHour is a sweep lookup refused inside the top-of-hour window.
const pacedByTopOfHour pacedBy = "top_of_hour"

// mdblistQuietWindow refuses sweep lookups from :00:00 to :0N:00 UTC and logs
// how many it refused once each window ends.
type mdblistQuietWindow struct {
	minutes int
	now     func() time.Time
	// after schedules the end-of-window log line.
	after  func(time.Duration, func())
	logger *slog.Logger

	mu      sync.Mutex
	start   time.Time
	skipped int64
}

func newMDBListQuietWindow(minutes int) *mdblistQuietWindow {
	return &mdblistQuietWindow{
		minutes: minutes,
		now:     time.Now,
		after:   func(d time.Duration, f func()) { time.AfterFunc(d, f) },
	}
}

func (q *mdblistQuietWindow) log() *slog.Logger {
	if q.logger == nil {
		return slog.Default()
	}
	return q.logger
}

func (q *mdblistQuietWindow) length() time.Duration {
	return time.Duration(q.minutes) * time.Minute
}

// hold returns ErrGovernorBacklog for a named sweep's lookup inside the window,
// nil otherwise. A caller with no user agent passes: it may proxy many people.
func (q *mdblistQuietWindow) hold(ctx context.Context) error {
	if q == nil || q.minutes <= 0 {
		return nil
	}
	if CallerClassFrom(ctx) != CallerBulk || HasOwnerKey(ctx, KeyMDBList) {
		return nil
	}
	now := q.now().UTC()
	if now.Minute() >= q.minutes {
		return nil
	}
	start := now.Truncate(time.Hour)

	q.mu.Lock()
	if q.skipped > 0 && !q.start.Equal(start) {
		q.reportLocked(ctx)
	}
	first := q.skipped == 0
	q.start = start
	q.skipped++
	q.mu.Unlock()

	if first {
		q.after(start.Add(q.length()).Sub(now), func() { q.flush(context.WithoutCancel(ctx)) })
	}
	return &backlogReason{err: ErrGovernorBacklog, paced: pacedByTopOfHour}
}

// flush logs the window's count once it has ended.
func (q *mdblistQuietWindow) flush(ctx context.Context) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.skipped == 0 || q.now().Before(q.start.Add(q.length())) {
		return
	}
	q.reportLocked(ctx)
}

func (q *mdblistQuietWindow) reportLocked(ctx context.Context) {
	q.log().InfoContext(ctx, "Sweep lookups skipped MDBList during the top-of-hour quiet window",
		"triggered_by", logging.RequestID(ctx), "skipped", q.skipped,
		"window_start", q.start.Format(time.RFC3339), "window_minutes", q.minutes)
	q.skipped = 0
}
