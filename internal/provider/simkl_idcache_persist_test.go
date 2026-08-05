package provider

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// simklCountingServer answers id lookups, counting them, and reports whether
// the title is one SIMKL carries.
func simklCountingServer(t *testing.T, known bool, lookups *int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/search/id") {
			*lookups++
			if known {
				_, _ = w.Write([]byte(`[{"ids":{"simkl":12345}}]`))
			} else {
				_, _ = w.Write([]byte(`[]`))
			}
			return
		}
		_, _ = w.Write([]byte(`{"title":"T","year":2001,"ratings":{"simkl":{"rating":8.1,"votes":10}}}`))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func simklAgainst(srv *httptest.Server) *SIMKL {
	s := NewSIMKL("cid")
	s.baseURL = srv.URL
	s.httpClient = srv.Client()
	return s
}

// The point of the whole change. Resolving twice in one process only proves the
// in-memory map; only a second process proves the mapping survived a restart.
func TestAResolvedIDSurvivesARestart(t *testing.T) {
	lookups := 0
	srv := simklCountingServer(t, true, &lookups)
	dir := t.TempDir()

	first := simklAgainst(srv)
	first.SetIDCachePath(dir, quietLogger())
	if _, err := first.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Fatalf("first fetch: %v", err)
	}
	if lookups != 1 {
		t.Fatalf("the first fetch made %d searches, want 1", lookups)
	}
	if err := first.SaveIDCache(); err != nil {
		t.Fatalf("save: %v", err)
	}

	// A new process, reading what the old one left behind.
	second := simklAgainst(srv)
	second.SetIDCachePath(dir, quietLogger())
	if _, err := second.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Fatalf("fetch after restart: %v", err)
	}
	if lookups != 1 {
		t.Errorf("the title was searched again after a restart: %d searches", lookups)
	}
}

// Without the file the restart must still search, which is what proves the test
// above is measuring the file rather than an empty code path.
func TestWithoutTheFileARestartSearchesAgain(t *testing.T) {
	lookups := 0
	srv := simklCountingServer(t, true, &lookups)

	first := simklAgainst(srv)
	first.SetIDCachePath(t.TempDir(), quietLogger())
	if _, err := first.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Fatalf("first fetch: %v", err)
	}
	_ = first.SaveIDCache()

	second := simklAgainst(srv)
	second.SetIDCachePath(t.TempDir(), quietLogger()) // a different directory
	_, _ = second.Fetch(context.Background(), "movie", "tt0111161")
	if lookups != 2 {
		t.Errorf("a process with no stored ids made %d searches, want 2", lookups)
	}
}

// A title SIMKL has no entry for was re-searched on every render, forever. It is
// the sweeps that walk those titles, so the miss costs more than the hit.
func TestAMissIsRememberedAcrossARestartAndThenExpires(t *testing.T) {
	lookups := 0
	srv := simklCountingServer(t, false, &lookups)
	dir := t.TempDir()
	now := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)

	first := simklAgainst(srv)
	first.nowFn = func() time.Time { return now }
	first.SetIDCachePath(dir, quietLogger())

	if _, err := first.Fetch(context.Background(), "movie", "tt9999999"); err == nil {
		t.Fatal("a title SIMKL does not carry returned no error")
	}
	if lookups != 1 {
		t.Fatalf("the first fetch made %d searches, want 1", lookups)
	}

	// Asked again in the same process.
	_, _ = first.Fetch(context.Background(), "movie", "tt9999999")
	if lookups != 1 {
		t.Fatalf("the miss was searched again in the same process: %d searches", lookups)
	}
	if err := first.SaveIDCache(); err != nil {
		t.Fatalf("save: %v", err)
	}

	// A new process still does not search for it.
	second := simklAgainst(srv)
	second.nowFn = func() time.Time { return now }
	second.SetIDCachePath(dir, quietLogger())
	_, _ = second.Fetch(context.Background(), "movie", "tt9999999")
	if lookups != 1 {
		t.Errorf("the miss was searched again after a restart: %d searches", lookups)
	}

	// The control. A miss that never expired and a correct one look identical
	// until the clock moves past the term, and a title SIMKL adds later would
	// otherwise never get its badge.
	aged := simklAgainst(srv)
	aged.nowFn = func() time.Time { return now.Add(simklIDMissTTL + time.Hour) }
	aged.SetIDCachePath(dir, quietLogger())
	_, _ = aged.Fetch(context.Background(), "movie", "tt9999999")
	if lookups != 2 {
		t.Errorf("an expired miss was not searched again: %d searches, want 2", lookups)
	}
}

// An expired miss must not be written back out, or the file grows without bound
// with entries that are already dead.
func TestAnExpiredMissIsNotPersisted(t *testing.T) {
	lookups := 0
	srv := simklCountingServer(t, false, &lookups)
	dir := t.TempDir()
	now := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)

	s := simklAgainst(srv)
	s.nowFn = func() time.Time { return now }
	s.SetIDCachePath(dir, quietLogger())
	_, _ = s.Fetch(context.Background(), "movie", "tt9999999")

	s.nowFn = func() time.Time { return now.Add(simklIDMissTTL + time.Hour) }
	if err := s.SaveIDCache(); err != nil {
		t.Fatalf("save: %v", err)
	}

	raw, err := os.ReadFile(filepath.Join(dir, simklIDCacheFile))
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if strings.Contains(string(raw), "tt9999999") {
		t.Error("an expired miss was written to disk")
	}
}

// Filling the cache must not throw away every resolution, which is what clearing
// it wholesale did one insert too late.
func TestAFullIDCacheKeepsMostOfWhatItHas(t *testing.T) {
	s := NewSIMKL("cid")
	for i := 0; i < simklIDCacheMax; i++ {
		s.rememberID("tt"+strconv.Itoa(i), "1")
	}
	if got := len(s.idCache); got != simklIDCacheMax {
		t.Fatalf("the cache holds %d before the bound, want %d", got, simklIDCacheMax)
	}
	s.rememberID("tt-one-more", "1")
	if got := len(s.idCache); got <= simklIDCacheMax/2 {
		t.Errorf("one insert past the bound dropped the cache to %d entries", got)
	}
}
