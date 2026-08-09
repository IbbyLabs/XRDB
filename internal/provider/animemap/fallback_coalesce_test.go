package animemap

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// MAL, AniList and Kitsu share one mapper and are each asked whether they apply
// to a title inside their own goroutine. A non-anime title misses both datasets,
// so before coalescing all three reached the live API with the same question.
func TestConcurrentLookupsForOneTitleMakeOneRequest(t *testing.T) {
	var calls atomic.Int64
	release := make(chan struct{})

	dataset := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer dataset.Close()

	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		<-release // hold the request open so all three callers arrive together
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"myanimelist":21,"anilist":21,"kitsu":12}]`))
	}))
	defer fallback.Close()

	m := newTestMapper(t, dataset.URL, fallback.URL)
	m.Resolve(context.Background(), "poster", "tt0388629") // warm the dataset

	const callers = 3
	var wg sync.WaitGroup
	results := make([]IDs, callers)
	found := make([]bool, callers)
	for i := range callers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i], found[i] = m.Resolve(context.Background(), "poster", "tt7777777")
		}()
	}

	// Let the callers pile up on the same key before the request completes.
	time.Sleep(150 * time.Millisecond)
	close(release)
	wg.Wait()

	if got := calls.Load(); got != 1 {
		t.Errorf("%d callers produced %d outbound mapping requests, want 1", callers, got)
	}
	for i := range callers {
		if !found[i] || results[i].MAL != 21 {
			t.Errorf("caller %d got (%+v, %v), want the shared result", i, results[i], found[i])
		}
	}
}

// A second render after the first must not reach the API at all.
func TestASettledTitleIsNotAskedAgain(t *testing.T) {
	var calls atomic.Int64

	dataset := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer dataset.Close()

	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`)) // a miss, which is the case that must stick
	}))
	defer fallback.Close()

	m := newTestMapper(t, dataset.URL, fallback.URL)
	m.Resolve(context.Background(), "poster", "tt0388629")

	for range 4 {
		m.Resolve(context.Background(), "poster", "tt8888888")
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("four renders produced %d requests, want 1", got)
	}
}

// One caller walking away must not abandon the lookup for the others, which is
// the reason the shared fetch runs on its own context.
func TestACancelledCallerDoesNotAbortTheOthers(t *testing.T) {
	var calls atomic.Int64
	release := make(chan struct{})

	dataset := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer dataset.Close()

	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		<-release
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"myanimelist":21,"anilist":21,"kitsu":12}]`))
	}))
	defer fallback.Close()

	m := newTestMapper(t, dataset.URL, fallback.URL)
	m.Resolve(context.Background(), "poster", "tt0388629")

	leaving, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); m.Resolve(leaving, "poster", "tt6666666") }()

	var stayed IDs
	var ok bool
	go func() {
		defer wg.Done()
		time.Sleep(60 * time.Millisecond) // arrive as a waiter on the same key
		stayed, ok = m.Resolve(context.Background(), "poster", "tt6666666")
	}()

	time.Sleep(120 * time.Millisecond)
	cancel()
	time.Sleep(60 * time.Millisecond)
	close(release)
	wg.Wait()

	if !ok || stayed.MAL != 21 {
		t.Errorf("the remaining caller got (%+v, %v) after the other left", stayed, ok)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("got %d outbound requests, want 1", got)
	}
}

// Reaching the limit used to replace the whole map, so a title asked for seconds
// earlier was discarded along with the cold ones and the next renders all missed
// together. Expired entries go first; a wholesale clear is the last resort.
func TestReachingTheLimitDropsExpiredEntriesFirst(t *testing.T) {
	m := &Mapper{
		fbCache:    make(map[string]fallbackEntry),
		fbInflight: make(map[string]*fbCall),
	}

	stale := time.Now().Add(-time.Hour)
	fresh := time.Now().Add(fallbackCacheTTL)
	for i := range fallbackCacheLimit {
		exp := fresh
		if i%2 == 0 {
			exp = stale
		}
		m.fbCache[strconv.Itoa(i)] = fallbackEntry{expires: exp}
	}

	m.fbMu.Lock()
	m.evictIfFullLocked()
	kept := len(m.fbCache)
	m.fbMu.Unlock()

	if kept != fallbackCacheLimit/2 {
		t.Fatalf("kept %d entries, want the %d unexpired ones", kept, fallbackCacheLimit/2)
	}
	for id, e := range m.fbCache {
		if time.Now().After(e.expires) {
			t.Fatalf("entry %s survived past its expiry", id)
		}
	}
}

// With nothing expired there is nothing to reclaim, so the bound still holds.
func TestAFullCacheOfFreshEntriesStillClears(t *testing.T) {
	m := &Mapper{
		fbCache:    make(map[string]fallbackEntry),
		fbInflight: make(map[string]*fbCall),
	}
	for i := range fallbackCacheLimit {
		m.fbCache[strconv.Itoa(i)] = fallbackEntry{expires: time.Now().Add(fallbackCacheTTL)}
	}

	m.fbMu.Lock()
	m.evictIfFullLocked()
	kept := len(m.fbCache)
	m.fbMu.Unlock()

	if kept != 0 {
		t.Fatalf("kept %d entries, want the wholesale clear to still bound the map", kept)
	}
}
