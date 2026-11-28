package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// slotServer answers batches after hold, or once release closes when hold is
// zero, and records the most batches it saw open at once. Single lookups answer
// at once.
type slotServer struct {
	*httptest.Server
	hold    time.Duration
	release chan struct{}
	open    atomic.Int32
	maxOpen atomic.Int32
	posts   atomic.Int32
	gets    atomic.Int32
}

func newSlotServer(t *testing.T, hold time.Duration) *slotServer {
	t.Helper()
	s := &slotServer{hold: hold, release: make(chan struct{})}
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			s.gets.Add(1)
			_ = json.NewEncoder(w).Encode(map[string]any{"score": 70.0, "ratings": []map[string]any{{"source": "imdb", "value": 7.0}}})
			return
		}
		s.posts.Add(1)
		n := s.open.Add(1)
		defer s.open.Add(-1)
		for {
			m := s.maxOpen.Load()
			if n <= m || s.maxOpen.CompareAndSwap(m, n) {
				break
			}
		}
		var body struct {
			IDs []string `json:"ids"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if s.hold > 0 {
			time.Sleep(s.hold)
		} else {
			select {
			case <-s.release:
			case <-r.Context().Done():
				return
			}
		}
		out := make([]map[string]any, 0, len(body.IDs))
		for _, id := range body.IDs {
			out = append(out, map[string]any{
				"type": "movie", "ids": map[string]any{"imdb": id}, "score": 80.0,
				"ratings": []map[string]any{{"source": "imdb", "value": 8.0}},
			})
		}
		_ = json.NewEncoder(w).Encode(out)
	}))
	t.Cleanup(func() {
		select {
		case <-s.release:
		default:
			close(s.release)
		}
		s.Close()
	})
	return s
}

func cappedMDBList(srv *slotServer, size int, window time.Duration, slots int, wait time.Duration) *MDBList {
	m := &MDBList{keys: newKeyRing("serverkey"), httpClient: srv.Client(), baseURL: srv.URL}
	m.batcher = newMDBListBatcher(m, size, window)
	m.batcher.capBulk(slots, wait)
	return m
}

// waitFor polls until cond holds or the deadline passes.
func waitUntil(t *testing.T, d time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(d)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not reached in time")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// Many sweep lookups at once never put more batches in flight than the cap,
// and every one is answered once its turn comes.
func TestSweepBatchesNeverExceedTheCap(t *testing.T) {
	srv := newSlotServer(t, 40*time.Millisecond)
	m := cappedMDBList(srv, 2, 0, 2, 10*time.Second)
	ctx := WithCallerClass(context.Background(), CallerBulk)

	const callers = 40
	var wg sync.WaitGroup
	var failed atomic.Int32
	for i := range callers {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if _, err := m.Fetch(ctx, "movie", fmt.Sprintf("tt%07d", i)); err != nil {
				failed.Add(1)
				t.Errorf("tt%07d: %v", i, err)
			}
		}(i)
	}
	wg.Wait()

	if got := srv.maxOpen.Load(); got > 2 {
		t.Fatalf("%d batches were in flight at once, want at most 2", got)
	}
	if srv.posts.Load() < 2 {
		t.Fatalf("only %d batches were sent, so the cap was never exercised", srv.posts.Load())
	}
	t.Logf("callers %d, batches %d, max in flight %d, failed %d",
		callers, srv.posts.Load(), srv.maxOpen.Load(), failed.Load())
}

// A full sweep queue does not touch a person's lookup: it goes out on its own
// request and returns while every slot is held.
func TestInteractiveLookupsAreNotHeldBehindAFullSweepQueue(t *testing.T) {
	srv := newSlotServer(t, 0)
	m := cappedMDBList(srv, 2, 0, 1, 5*time.Second)
	bulk := WithCallerClass(context.Background(), CallerBulk)

	var wg sync.WaitGroup
	for i := range 6 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _ = m.Fetch(bulk, "movie", fmt.Sprintf("tt%07d", i))
		}(i)
	}
	waitUntil(t, 2*time.Second, func() bool { return srv.open.Load() == 1 && m.batcher.queuedNow.Load() >= 1 })

	ictx, cancel := context.WithTimeout(WithCallerClass(context.Background(), CallerInteractive), time.Second)
	defer cancel()
	start := time.Now()
	meta, err := m.Fetch(ictx, "movie", "tt9999999")
	if err != nil || meta == nil {
		t.Fatalf("interactive lookup: meta %v err %v", meta, err)
	}
	if took := time.Since(start); took > 500*time.Millisecond {
		t.Fatalf("interactive lookup took %v behind a full sweep queue", took)
	}
	if srv.gets.Load() != 1 {
		t.Fatalf("single lookups = %d, want 1", srv.gets.Load())
	}
	close(srv.release)
	wg.Wait()
}

// The wait for a slot is bounded. Past it the batch fails as our own pacing,
// which a render answers from remembered ratings or leaves empty, and which is
// not held against MDBList's health.
func TestASweepBatchGivesUpAfterItsSlotWait(t *testing.T) {
	srv := newSlotServer(t, 0)
	m := cappedMDBList(srv, 2, 0, 1, 150*time.Millisecond)
	bulk := WithCallerClass(context.Background(), CallerBulk)

	first := make(chan error, 1)
	go func() {
		_, err := m.Fetch(bulk, "movie", "tt0000001")
		first <- err
	}()
	waitUntil(t, 2*time.Second, func() bool { return srv.open.Load() == 1 })

	// The render's own deadline is far longer; the slot wait must still win.
	ctx, cancel := context.WithTimeout(bulk, 10*time.Second)
	defer cancel()
	start := time.Now()
	_, err := m.Fetch(ctx, "movie", "tt0000002")
	took := time.Since(start)

	if !errors.Is(err, ErrGovernorBacklog) {
		t.Fatalf("err = %v, want ErrGovernorBacklog", err)
	}
	if took < 140*time.Millisecond || took > time.Second {
		t.Fatalf("gave up after %v, want about 150ms", took)
	}
	if gate := HoldOutGate(err); gate != GateGovernorBacklog {
		t.Errorf("gate = %q, want %q", gate, GateGovernorBacklog)
	}
	if reason := HoldOutReason(err); reason != string(pacedByBatchSlots) {
		t.Errorf("paced_by = %q, want %q", reason, pacedByBatchSlots)
	}
	if RecordsAgainstHealth(err) {
		t.Error("our own slot wait was recorded against MDBList's health")
	}
	if srv.posts.Load() != 1 {
		t.Errorf("batches sent = %d, want 1: the refused one must not go out", srv.posts.Load())
	}
	close(srv.release)
	if err := <-first; err != nil {
		t.Errorf("the batch holding the slot: %v", err)
	}
}

// A slot freed during the wait is taken rather than the wait running out.
func TestASweepBatchTakesASlotFreedDuringItsWait(t *testing.T) {
	srv := newSlotServer(t, 0)
	m := cappedMDBList(srv, 2, 0, 1, 5*time.Second)
	bulk := WithCallerClass(context.Background(), CallerBulk)

	go func() { _, _ = m.Fetch(bulk, "movie", "tt0000001") }()
	waitUntil(t, 2*time.Second, func() bool { return srv.open.Load() == 1 })
	second := make(chan error, 1)
	go func() {
		_, err := m.Fetch(bulk, "movie", "tt0000002")
		second <- err
	}()
	waitUntil(t, 2*time.Second, func() bool { return m.batcher.queuedNow.Load() == 1 })
	close(srv.release)
	if err := <-second; err != nil {
		t.Fatalf("queued batch: %v", err)
	}
}

// A batch carrying a caller with no user agent keeps a person's place.
func TestABatchWithAnUnknownCallerIsNotCapped(t *testing.T) {
	srv := newSlotServer(t, 0)
	m := cappedMDBList(srv, 2, 0, 1, 5*time.Second)
	go func() { _, _ = m.Fetch(WithCallerClass(context.Background(), CallerBulk), "movie", "tt0000001") }()
	waitUntil(t, 2*time.Second, func() bool { return srv.open.Load() == 1 })

	done := make(chan error, 1)
	go func() {
		_, err := m.Fetch(WithCallerClass(context.Background(), CallerUnknown), "movie", "tt0000002")
		done <- err
	}()
	waitUntil(t, 2*time.Second, func() bool { return srv.open.Load() == 2 })
	close(srv.release)
	if err := <-done; err != nil {
		t.Fatalf("unknown caller: %v", err)
	}
}

// Queueing at the cap warns once per interval, however many batches queue.
func TestQueuedSweepBatchesWarnAtMostOncePerInterval(t *testing.T) {
	var buf bytes.Buffer
	var mu sync.Mutex
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&lockedWriter{w: &buf, mu: &mu}, nil)))
	defer slog.SetDefault(prev)

	srv := newSlotServer(t, 0)
	m := cappedMDBList(srv, 2, 0, 1, 50*time.Millisecond)
	bulk := WithCallerClass(context.Background(), CallerBulk)
	go func() { _, _ = m.Fetch(bulk, "movie", "tt0000001") }()
	waitUntil(t, 2*time.Second, func() bool { return srv.open.Load() == 1 })

	var wg sync.WaitGroup
	for i := range 10 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _ = m.Fetch(bulk, "movie", fmt.Sprintf("tt%07d", 100+i))
		}(i)
	}
	wg.Wait()
	close(srv.release)

	mu.Lock()
	out := buf.String()
	mu.Unlock()
	if n := strings.Count(out, "Sweep batches to MDBList are queued at their cap"); n != 1 {
		t.Fatalf("queued warnings = %d, want 1:\n%s", n, out)
	}
	if !strings.Contains(out, `"queued":`) || !strings.Contains(out, `"cap":1`) {
		t.Errorf("warning lacks the queue depth or cap:\n%s", out)
	}
	if got := m.batcher.gaveUpTotal.Load(); got == 0 {
		t.Error("no queued batch gave up, so the warning was not exercised under a full cap")
	}
}

type lockedWriter struct {
	w  *bytes.Buffer
	mu *sync.Mutex
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}

// The defaults: two sweep batches in flight, each waiting 1.5s for a slot.
func TestBulkBatchCapDefaults(t *testing.T) {
	t.Setenv("XRDB_MDBLIST_BULK_BATCHES", "")
	t.Setenv("XRDB_MDBLIST_BULK_BATCH_WAIT_MS", "")
	if got := mdblistBulkBatchSlots(); got != 2 {
		t.Errorf("slots = %d, want 2", got)
	}
	if got := mdblistBulkBatchWait(); got != 1500*time.Millisecond {
		t.Errorf("wait = %v, want 1.5s", got)
	}
	t.Setenv("XRDB_MDBLIST_BULK_BATCHES", "0")
	m := NewMDBList("k")
	if m.batcher.slots != nil {
		t.Error("XRDB_MDBLIST_BULK_BATCHES=0 left a cap in place")
	}
}
