package provider

import (
	"context"
	"encoding/json"
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

// An expired miss must not survive, or the store grows with entries that are
// already dead and a title added upstream stays invisible.
func TestAnExpiredMissIsNotKept(t *testing.T) {
	lookups := 0
	srv := simklCountingServer(t, false, &lookups)
	dir := t.TempDir()
	now := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)

	s := simklAgainst(srv)
	s.nowFn = func() time.Time { return now }
	s.SetIDCachePath(dir, quietLogger())
	_, _ = s.Fetch(context.Background(), "movie", "tt9999999")
	if s.IDCacheStats().Misses != 1 {
		t.Fatalf("the miss was not recorded, so its expiry proves nothing")
	}

	s.nowFn = func() time.Time { return now.Add(simklIDMissTTL + time.Hour) }
	if err := s.SaveIDCache(); err != nil {
		t.Fatalf("save: %v", err)
	}
	if got := s.IDCacheStats().Misses; got != 0 {
		t.Errorf("%d expired misses are still stored", got)
	}
}

// Nothing evicts. An id never changes, so a resolution dropped is a search paid
// for twice, and the store is on disk rather than in the heap.
func TestNoResolutionIsEverEvicted(t *testing.T) {
	s := NewSIMKL("cid")
	s.SetIDCachePath(t.TempDir(), quietLogger())

	const n = 5000
	for i := 0; i < n; i++ {
		s.rememberID("tt"+strconv.Itoa(i), strconv.Itoa(i))
	}
	if got := s.IDCacheStats().IDs; got != n {
		t.Fatalf("the store holds %d of %d resolutions", got, n)
	}
	// The first one written is still there, which is the entry an eviction
	// scheme would have taken.
	if id, ok := s.cachedID("tt0"); !ok || id != "0" {
		t.Errorf("the oldest resolution was lost: %q %v", id, ok)
	}
}

// The store replaced a JSON file. Whatever an older release left behind has to
// come across, or the first start after the upgrade re-searches everything.
func TestTheOldJSONFileIsMigrated(t *testing.T) {
	lookups := 0
	srv := simklCountingServer(t, true, &lookups)
	dir := t.TempDir()

	snap := simklIDSnapshot{
		Shape:  simklIDCacheShape,
		IDs:    map[string]string{"tt0111161": "12345"},
		Misses: map[string]time.Time{"tt9999999": time.Now()},
	}
	data, _ := json.Marshal(snap)
	if err := os.WriteFile(filepath.Join(dir, simklIDCacheFile), data, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	s := simklAgainst(srv)
	s.SetIDCachePath(dir, quietLogger())

	if st := s.IDCacheStats(); st.IDs != 1 || st.Misses != 1 {
		t.Fatalf("migration brought across %d ids and %d misses, want 1 and 1", st.IDs, st.Misses)
	}
	// The check that matters is the search count, not the row count: rows that
	// nothing reads would satisfy the assertion above.
	if _, err := s.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if lookups != 0 {
		t.Errorf("a migrated id was searched for anyway: %d searches", lookups)
	}
	// And the old file is out of the way, so it is not read again.
	if _, err := os.Stat(filepath.Join(dir, simklIDCacheFile)); !os.IsNotExist(err) {
		t.Error("the old JSON file is still in place after migration")
	}
}

// The property the whole store exists for, asserted on searches rather than on
// rows: a title resolved before a restart is not searched for again after one.
func TestAResolvedIDSurvivesARestartInTheStore(t *testing.T) {
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

	second := simklAgainst(srv) // a new process
	second.SetIDCachePath(dir, quietLogger())
	if _, err := second.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Fatalf("fetch after restart: %v", err)
	}
	if lookups != 1 {
		t.Errorf("searches_sent climbed for a title already known: %d", lookups)
	}
	if st := second.IDCacheStats(); st.Hits == 0 {
		t.Error("the answer did not come from the store")
	}
}
