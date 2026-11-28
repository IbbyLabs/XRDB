package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"
)

// quietClock is a settable clock for the quiet window.
type quietClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *quietClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *quietClock) set(t time.Time) {
	c.mu.Lock()
	c.t = t
	c.mu.Unlock()
}

// quietMDBList is an unbatched MDBList on srv with a quiet window of minutes
// read from clock. Scheduled end-of-window callbacks are collected in timers.
func quietMDBList(srv *slotServer, minutes int, clock *quietClock, timers *[]func()) *MDBList {
	m := &MDBList{keys: newKeyRing("serverkey"), httpClient: srv.Client(), baseURL: srv.URL}
	m.quiet = newMDBListQuietWindow(minutes)
	m.quiet.now = clock.now
	m.quiet.after = func(_ time.Duration, f func()) {
		if timers != nil {
			*timers = append(*timers, f)
		}
	}
	return m
}

func quietAt(min, sec int) time.Time {
	return time.Date(2026, 11, 28, 3, min, sec, 0, time.UTC)
}

var quietBulkCtx = WithCallerClass(context.Background(), CallerBulk)

func TestTheQuietWindowCoversTheFirstMinutesOfEachHour(t *testing.T) {
	for _, tc := range []struct {
		name string
		when time.Time
		held bool
	}{
		{"on the hour", quietAt(0, 0), true},
		{"last second inside", quietAt(1, 59), true},
		{"window ended", quietAt(2, 0), false},
		{"mid hour", quietAt(30, 0), false},
		{"just before the hour", quietAt(59, 59), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := newSlotServer(t, 0)
			clock := &quietClock{t: tc.when}
			m := quietMDBList(srv, 2, clock, nil)
			_, err := m.Fetch(quietBulkCtx, "movie", "tt0111161")
			if tc.held {
				if !errors.Is(err, ErrGovernorBacklog) {
					t.Fatalf("err = %v, want ErrGovernorBacklog", err)
				}
				if got := HoldOutReason(err); got != string(pacedByTopOfHour) {
					t.Errorf("paced_by = %q, want %q", got, pacedByTopOfHour)
				}
				if got := HoldOutGate(err); got != GateGovernorBacklog {
					t.Errorf("gate = %q, want %q", got, GateGovernorBacklog)
				}
				if n := srv.gets.Load() + srv.posts.Load(); n != 0 {
					t.Errorf("MDBList was called %d times inside the window", n)
				}
				return
			}
			if err != nil {
				t.Fatalf("err = %v outside the window", err)
			}
			if srv.gets.Load() != 1 {
				t.Errorf("MDBList calls = %d, want 1", srv.gets.Load())
			}
		})
	}
}

// The window is in UTC whatever zone the clock reports in.
func TestTheQuietWindowIsReadInUTC(t *testing.T) {
	srv := newSlotServer(t, 0)
	halfHour := time.FixedZone("UTC+0530", 5*3600+30*60)
	clock := &quietClock{t: quietAt(0, 30).In(halfHour)}
	m := quietMDBList(srv, 2, clock, nil)
	if _, err := m.Fetch(quietBulkCtx, "movie", "tt0111161"); !errors.Is(err, ErrGovernorBacklog) {
		t.Fatalf("err = %v, want the lookup held at 03:00:30 UTC", err)
	}
}

func TestAQuietWindowOfZeroIsOff(t *testing.T) {
	srv := newSlotServer(t, 0)
	m := quietMDBList(srv, 0, &quietClock{t: quietAt(0, 30)}, nil)
	if _, err := m.Fetch(quietBulkCtx, "movie", "tt0111161"); err != nil {
		t.Fatalf("err = %v with the window off", err)
	}
	if srv.gets.Load() != 1 {
		t.Errorf("MDBList calls = %d, want 1", srv.gets.Load())
	}
}

func TestTheQuietWindowSettingDefaultsAndBounds(t *testing.T) {
	t.Setenv("XRDB_MDBLIST_BULK_QUIET_MINUTES", "")
	if got := mdblistBulkQuietMinutes(); got != 2 {
		t.Errorf("default = %d, want 2", got)
	}
	t.Setenv("XRDB_MDBLIST_BULK_QUIET_MINUTES", "0")
	if got := mdblistBulkQuietMinutes(); got != 0 {
		t.Errorf("0 read as %d", got)
	}
	t.Setenv("XRDB_MDBLIST_BULK_QUIET_MINUTES", "10")
	if got := mdblistBulkQuietMinutes(); got != 10 {
		t.Errorf("10 read as %d", got)
	}
}

// Only sweeps on the server's key are held. A person's lookup, and a lookup on
// the owner's own key, go out as usual; a caller with no user agent is a sweep.
func TestTheQuietWindowHoldsOnlySweepsOnTheServersKey(t *testing.T) {
	for _, tc := range []struct {
		name string
		ctx  context.Context
		held bool
	}{
		{"interactive", WithCallerClass(context.Background(), CallerInteractive), false},
		{"owner keyed sweep", WithKeys(quietBulkCtx, map[string]string{KeyMDBList: "ownerkey"}), false},
		{"named sweep", quietBulkCtx, true},
		{"no user agent", WithCallerClass(context.Background(), CallerUnknown), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := newSlotServer(t, 0)
			m := quietMDBList(srv, 2, &quietClock{t: quietAt(0, 30)}, nil)
			_, err := m.Fetch(tc.ctx, "movie", "tt0111161")
			if tc.held != errors.Is(err, ErrGovernorBacklog) {
				t.Fatalf("held = %v, want %v (err %v)", !tc.held, tc.held, err)
			}
			if !tc.held && srv.gets.Load() != 1 {
				t.Errorf("MDBList calls = %d, want 1", srv.gets.Load())
			}
		})
	}
}

// A held lookup is our own pacing. It never counts against MDBList's health and
// never opens the breaker, however many there are.
func TestQuietWindowHoldsLeaveHealthAndTheBreakerAlone(t *testing.T) {
	srv := newSlotServer(t, 0)
	m := quietMDBList(srv, 2, &quietClock{t: quietAt(0, 30)}, nil)
	h := NewHealthTracker(0, 0)
	for range 50 {
		_, err := m.Fetch(quietBulkCtx, "movie", "tt0111161")
		if RecordsAgainstHealth(err) {
			t.Fatalf("a quiet-window hold records against health: %v", err)
		}
		if h.Failure("mdblist", err, CallerBulk) {
			t.Fatal("a quiet-window hold opened the breaker")
		}
	}
	if h.CoolingOff("mdblist", CallerBulk) || h.CoolingOff("mdblist", CallerInteractive) {
		t.Error("mdblist is cooling off after quiet-window holds")
	}
	for _, s := range h.Snapshot() {
		if s.Source == "mdblist" && (s.Failures != 0 || s.ConsecutiveFail != 0 || s.BreakerTrips != 0) {
			t.Errorf("health moved: %+v", s)
		}
	}
}

// One line per window, once it ends, carrying how many lookups it held.
func TestTheQuietWindowLogsItsCountOnceItEnds(t *testing.T) {
	srv := newSlotServer(t, 0)
	clock := &quietClock{t: quietAt(0, 5)}
	var timers []func()
	m := quietMDBList(srv, 2, clock, &timers)
	var buf bytes.Buffer
	m.quiet.logger = slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	for _, sec := range []int{5, 40, 119} {
		clock.set(quietAt(sec/60, sec%60))
		if _, err := m.Fetch(quietBulkCtx, "movie", "tt0111161"); !errors.Is(err, ErrGovernorBacklog) {
			t.Fatalf("err = %v at %ds", err, sec)
		}
	}
	if len(timers) != 1 {
		t.Fatalf("%d end-of-window callbacks scheduled, want 1", len(timers))
	}
	timers[0]()
	if buf.Len() != 0 {
		t.Fatalf("logged before the window ended: %s", buf.String())
	}

	clock.set(quietAt(2, 0))
	if _, err := m.Fetch(quietBulkCtx, "movie", "tt0111161"); err != nil {
		t.Fatalf("err = %v after the window", err)
	}
	timers[0]()
	timers[0]()
	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("got %d log lines, want 1: %s", len(lines), buf.String())
	}
	var rec map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &rec); err != nil {
		t.Fatal(err)
	}
	if rec["level"] != "INFO" {
		t.Errorf("level = %v, want INFO", rec["level"])
	}
	if rec["skipped"] != float64(3) {
		t.Errorf("skipped = %v, want 3", rec["skipped"])
	}
	if rec["window_minutes"] != float64(2) {
		t.Errorf("window_minutes = %v, want 2", rec["window_minutes"])
	}

	// The next hour starts a fresh count and a fresh callback.
	clock.set(time.Date(2026, 11, 28, 4, 0, 10, 0, time.UTC))
	_, _ = m.Fetch(quietBulkCtx, "movie", "tt0111161")
	if len(timers) != 2 {
		t.Fatalf("%d callbacks after the next hour's first hold, want 2", len(timers))
	}
	clock.set(time.Date(2026, 11, 28, 4, 2, 0, 0, time.UTC))
	timers[1]()
	if !strings.Contains(buf.String(), `"skipped":1`) {
		t.Errorf("the next window's count was not logged as 1: %s", buf.String())
	}
}

// A window nobody hit is not logged at all, and a window whose callback was
// missed is reported when the next one starts.
func TestAMissedEndOfWindowIsReportedWhenTheNextWindowStarts(t *testing.T) {
	srv := newSlotServer(t, 0)
	clock := &quietClock{t: quietAt(0, 5)}
	m := quietMDBList(srv, 2, clock, nil)
	var buf bytes.Buffer
	m.quiet.logger = slog.New(slog.NewJSONHandler(&buf, nil))

	_, _ = m.Fetch(quietBulkCtx, "movie", "tt0111161")
	_, _ = m.Fetch(quietBulkCtx, "movie", "tt0111162")
	if buf.Len() != 0 {
		t.Fatalf("logged inside the window: %s", buf.String())
	}
	clock.set(time.Date(2026, 11, 28, 4, 0, 1, 0, time.UTC))
	_, _ = m.Fetch(quietBulkCtx, "movie", "tt0111161")
	if !strings.Contains(buf.String(), `"skipped":2`) {
		t.Errorf("the earlier window's count was not reported: %s", buf.String())
	}
}
