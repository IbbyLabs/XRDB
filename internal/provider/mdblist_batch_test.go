package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func mdblistBatchServer(t *testing.T, posts, gets *atomic.Int32, status int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			gets.Add(1)
			_ = json.NewEncoder(w).Encode(map[string]any{"score": 70.0, "ratings": []map[string]any{{"source": "imdb", "value": 7.0}}})
			return
		}
		posts.Add(1)
		if r.URL.Path != "/imdb/any" {
			t.Errorf("batch path = %s, want /imdb/any", r.URL.Path)
		}
		if status != http.StatusOK {
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.WriteHeader(status)
			return
		}
		var body struct {
			IDs []string `json:"ids"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		var out []map[string]any
		for _, id := range body.IDs {
			if id == "tt0000404" {
				continue
			}
			out = append(out, map[string]any{
				"type": "movie", "ids": map[string]any{"imdb": id}, "score": 80.0,
				"ratings": []map[string]any{{"source": "imdb", "value": 8.0}},
			})
		}
		_ = json.NewEncoder(w).Encode(out)
	}))
}

func newBatchingMDBList(srv *httptest.Server, size int, window time.Duration) *MDBList {
	m := &MDBList{keys: newKeyRing("serverkey"), httpClient: srv.Client(), baseURL: srv.URL}
	m.batcher = newMDBListBatcher(m, size, window)
	return m
}

// A sweep's lookups share one request; MDBList bills it as one.
func TestMDBListSweepLookupsShareOneRequest(t *testing.T) {
	var posts, gets atomic.Int32
	srv := mdblistBatchServer(t, &posts, &gets, http.StatusOK)
	defer srv.Close()
	m := newBatchingMDBList(srv, 50, 200*time.Millisecond)

	ids := []string{"tt0000001", "tt0000002", "tt0000003", "tt0000404", "tt0000005"}
	ctx := WithCallerClass(context.Background(), CallerBulk)
	var wg sync.WaitGroup
	errs := make([]error, len(ids))
	metas := make([]*MediaMeta, len(ids))
	for i, id := range ids {
		wg.Add(1)
		go func(i int, id string) {
			defer wg.Done()
			metas[i], errs[i] = m.Fetch(ctx, "movie", id)
		}(i, id)
	}
	wg.Wait()

	if posts.Load() != 1 || gets.Load() != 0 {
		t.Fatalf("requests: %d batch, %d single; want 1 batch, 0 single", posts.Load(), gets.Load())
	}
	for i, id := range ids {
		if id == "tt0000404" {
			if !errors.Is(errs[i], errNotFound) {
				t.Errorf("%s: err = %v, want not found", id, errs[i])
			}
			continue
		}
		if errs[i] != nil || metas[i] == nil || len(metas[i].Ratings) == 0 {
			t.Errorf("%s: meta %+v err %v, want ratings", id, metas[i], errs[i])
		}
	}
}

// A full batch goes at once rather than waiting out the window.
func TestMDBListBatchSendsWhenFull(t *testing.T) {
	var posts, gets atomic.Int32
	srv := mdblistBatchServer(t, &posts, &gets, http.StatusOK)
	defer srv.Close()
	m := newBatchingMDBList(srv, 2, time.Hour)
	ctx := WithCallerClass(context.Background(), CallerBulk)

	done := make(chan struct{})
	go func() {
		var wg sync.WaitGroup
		for _, id := range []string{"tt0000001", "tt0000002"} {
			wg.Add(1)
			go func(id string) { defer wg.Done(); _, _ = m.Fetch(ctx, "movie", id) }(id)
		}
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("a full batch waited for its window")
	}
	if posts.Load() != 1 {
		t.Errorf("batch requests = %d, want 1", posts.Load())
	}
}

// People's renders and owner keys keep the single lookup.
func TestMDBListInteractiveAndOwnerKeysStaySingle(t *testing.T) {
	var posts, gets atomic.Int32
	srv := mdblistBatchServer(t, &posts, &gets, http.StatusOK)
	defer srv.Close()
	m := newBatchingMDBList(srv, 50, 10*time.Millisecond)

	if _, err := m.Fetch(WithCallerClass(context.Background(), CallerInteractive), "movie", "tt0000001"); err != nil {
		t.Fatalf("interactive: %v", err)
	}
	owner := WithKeys(WithCallerClass(context.Background(), CallerBulk), map[string]string{KeyMDBList: "ownerkey"})
	if _, err := m.Fetch(owner, "movie", "tt0000002"); err != nil {
		t.Fatalf("owner key: %v", err)
	}
	if posts.Load() != 0 || gets.Load() != 2 {
		t.Errorf("requests: %d batch, %d single; want 0 batch, 2 single", posts.Load(), gets.Load())
	}
}

// A refused batch is one failure for health; the others ride on it.
func TestMDBListRefusedBatchCountsOnce(t *testing.T) {
	var posts, gets atomic.Int32
	srv := mdblistBatchServer(t, &posts, &gets, http.StatusTooManyRequests)
	defer srv.Close()
	m := newBatchingMDBList(srv, 50, 100*time.Millisecond)
	ctx := WithCallerClass(context.Background(), CallerBulk)

	var wg sync.WaitGroup
	var mu sync.Mutex
	var counted, riders int
	for _, id := range []string{"tt0000001", "tt0000002", "tt0000003"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			_, err := m.Fetch(ctx, "movie", id)
			var rl *RateLimitError
			if !errors.As(err, &rl) {
				t.Errorf("%s: err = %v, want a rate limit", id, err)
			}
			mu.Lock()
			if errors.Is(err, errMDBListBatchShared) {
				riders++
			} else {
				counted++
			}
			mu.Unlock()
		}(id)
	}
	wg.Wait()
	if posts.Load() != 1 || counted != 1 || riders != 2 {
		t.Errorf("posts %d, counted %d, riders %d; want 1, 1, 2", posts.Load(), counted, riders)
	}
}

// capServer answers like a plan with a batch cap of 10: refusing or cutting short a bigger batch.
func capServer(t *testing.T, refuse bool, known func(string) bool, posts *atomic.Int32, maxSeen *atomic.Int32) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		posts.Add(1)
		var body struct {
			IDs []string `json:"ids"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if n := int32(len(body.IDs)); n > maxSeen.Load() {
			maxSeen.Store(n)
		}
		if refuse && len(body.IDs) > 10 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		var out []map[string]any
		for _, id := range body.IDs {
			if len(out) == 10 || !known(id) {
				continue
			}
			out = append(out, map[string]any{"type": "movie", "ids": map[string]any{"imdb": id}, "score": 80.0})
		}
		_ = json.NewEncoder(w).Encode(out)
	}))
}

func titles(n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("tt%07d", i+1)
	}
	return out
}

func TestMDBListBatchLearnsAPlansCap(t *testing.T) {
	all := func(string) bool { return true }
	for _, refuse := range []bool{true, false} {
		var posts, maxSeen atomic.Int32
		srv := capServer(t, refuse, all, &posts, &maxSeen)
		m := newBatchingMDBList(srv, 50, time.Second)
		got, err := m.batcher.sendAll(WithCallerClass(context.Background(), CallerBulk), titles(30))
		srv.Close()
		if err != nil || len(got) != 30 {
			t.Fatalf("refuse=%v: %d of 30 answered, err %v", refuse, len(got), err)
		}
		if size := m.batcher.size(); size != 10 {
			t.Errorf("refuse=%v: size = %d, want 10", refuse, size)
		}
	}
}

// Ten answers from thirty can be twenty titles MDBList does not have.
func TestMDBListBatchKeepsItsSizeForGenuineMisses(t *testing.T) {
	var posts, maxSeen atomic.Int32
	known := func(id string) bool { return id <= "tt0000010" }
	srv := capServer(t, false, known, &posts, &maxSeen)
	defer srv.Close()
	m := newBatchingMDBList(srv, 50, time.Second)
	got, err := m.batcher.sendAll(WithCallerClass(context.Background(), CallerBulk), titles(30))
	if err != nil || len(got) != 10 {
		t.Fatalf("%d answered, err %v; want 10", len(got), err)
	}
	if size := m.batcher.size(); size != 50 {
		t.Errorf("size = %d, want 50 kept", size)
	}
	if posts.Load() != 2 {
		t.Errorf("requests = %d, want the batch and one probe", posts.Load())
	}
}
