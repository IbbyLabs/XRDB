package provider

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// gzTSV builds a ratings dataset body with one title at the given rating.
func gzTSV(t *testing.T, rating string) []byte {
	t.Helper()
	var buf writeBuf
	gz := gzip.NewWriter(&buf)
	_, _ = gz.Write([]byte("tconst\taverageRating\tnumVotes\n"))
	_, _ = fmt.Fprintf(gz, "tt0111161\t%s\t2800000\n", rating)
	if err := gz.Close(); err != nil {
		t.Fatalf("gzip: %v", err)
	}
	return buf.b
}

type writeBuf struct{ b []byte }

func (w *writeBuf) Write(p []byte) (int, error) { w.b = append(w.b, p...); return len(p), nil }

func ratingOf(t *testing.T, d *IMDbDataset) float64 {
	t.Helper()
	meta, err := d.Fetch(context.Background(), "movie", "tt0111161")
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if len(meta.Ratings) == 0 {
		t.Fatal("no rating returned")
	}
	return meta.Ratings[0].Value
}

// The age check only ever ran on the first Fetch, so a long-running process
// served whatever it downloaded at startup, indefinitely (FR-167).
func TestARefreshReplacesTheLiveIndex(t *testing.T) {
	rating := "9.3"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(gzTSV(t, rating))
	}))
	defer srv.Close()

	d := NewIMDbDataset(t.TempDir())
	d.httpClient = srv.Client()
	d.ratingsURL = srv.URL

	if got := ratingOf(t, d); got != 9.3 {
		t.Fatalf("first load gave %v, want 9.3", got)
	}

	rating = "8.1" // IMDb publishes a new figure
	if err := d.refresh(context.Background()); err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if got := ratingOf(t, d); got != 8.1 {
		t.Errorf("after a refresh the index still serves %v; the rebuild did not take", got)
	}
}

// The control that matters: a refresh that fails must leave the previous index
// serving. Stale ratings beat none, and dropping the index was the old
// behaviour of Download.
func TestAFailedRefreshKeepsTheOldIndexServing(t *testing.T) {
	fail := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if fail {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		_, _ = w.Write(gzTSV(t, "9.3"))
	}))
	defer srv.Close()

	d := NewIMDbDataset(t.TempDir())
	d.httpClient = srv.Client()
	d.ratingsURL = srv.URL

	if got := ratingOf(t, d); got != 9.3 {
		t.Fatalf("first load gave %v, want 9.3", got)
	}

	fail = true
	if err := d.refresh(context.Background()); err == nil {
		t.Fatal("a failing download reported success")
	}
	if got := ratingOf(t, d); got != 9.3 {
		t.Errorf("a failed refresh left %v serving; the previous index must survive", got)
	}
	if n := d.Titles(); n != 1 {
		t.Errorf("the index holds %d titles after a failed refresh, want 1", n)
	}
}

// The defect being fixed was unreachable code: an age check that was correct,
// tested, and never called again after the first lookup. A test suite that
// drives refresh directly would leave that same hole one level up — the ticker
// could never fire and nothing would notice.
func TestTheTimerRebuildsWithoutBeingCalled(t *testing.T) {
	var mu sync.Mutex
	rating := "9.3"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		body := gzTSV(t, rating)
		mu.Unlock()
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	d := NewIMDbDataset(t.TempDir())
	d.httpClient = srv.Client()
	d.ratingsURL = srv.URL
	if got := ratingOf(t, d); got != 9.3 {
		t.Fatalf("first load gave %v, want 9.3", got)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	d.StartRefresh(ctx, 5*time.Millisecond, quietDatasetLogger())

	mu.Lock()
	rating = "8.1"
	mu.Unlock()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if ratingOf(t, d) == 8.1 {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Error("the index never rebuilt on its own; the timer does not reach refresh")
}

// An interval of zero turns the rebuild off rather than spinning, and must not
// rebuild on its own.
func TestStartRefreshIgnoresAZeroInterval(t *testing.T) {
	var mu sync.Mutex
	rating := "9.3"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		body := gzTSV(t, rating)
		mu.Unlock()
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	d := NewIMDbDataset(t.TempDir())
	d.httpClient = srv.Client()
	d.ratingsURL = srv.URL
	_ = ratingOf(t, d)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	d.StartRefresh(ctx, 0, quietDatasetLogger())

	mu.Lock()
	rating = "8.1"
	mu.Unlock()
	time.Sleep(50 * time.Millisecond)

	if got := ratingOf(t, d); got != 9.3 {
		t.Errorf("a zero interval rebuilt anyway: the index now serves %v", got)
	}
}

func quietDatasetLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// capture returns a logger writing into buf, for asserting on what was said.
func capture(buf *strings.Builder) *slog.Logger {
	return slog.New(slog.NewTextHandler(buf, nil))
}

// A scheduled refresh, a disabled one and a dataset that is switched off all
// produced the same silence, so an operator could not tell which they had until
// the first interval elapsed — a week at the default.
func TestStartRefreshSaysWhatItDid(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var armed strings.Builder
	d := NewIMDbDataset(t.TempDir())
	d.StartRefresh(ctx, time.Hour, capture(&armed))
	if !strings.Contains(armed.String(), "Scheduled the IMDb dataset refresh") ||
		!strings.Contains(armed.String(), "1h0m0s") {
		t.Errorf("arming said: %q", armed.String())
	}

	// The control: the two silent cases must say something different, or the
	// assertion above passes for a line printed unconditionally.
	var off strings.Builder
	var nilDataset *IMDbDataset
	nilDataset.StartRefresh(ctx, time.Hour, capture(&off))
	if !strings.Contains(off.String(), "not configured") {
		t.Errorf("a dataset that is off said: %q", off.String())
	}
	if strings.Contains(off.String(), "Scheduled") {
		t.Error("a dataset that is off reported a scheduled refresh")
	}

	var zero strings.Builder
	NewIMDbDataset(t.TempDir()).StartRefresh(ctx, 0, capture(&zero))
	if !strings.Contains(zero.String(), "disabled by a zero interval") {
		t.Errorf("a zero interval said: %q", zero.String())
	}
	if strings.Contains(zero.String(), "Scheduled") {
		t.Error("a zero interval reported a scheduled refresh")
	}
}
