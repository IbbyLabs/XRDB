package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/provider"
)

// A caller that gives up while queued writes nothing to the response, and the
// access log turns "nothing written" into 200. The render metrics record 499
// for the same request, so the two instruments disagree about it.
func TestAnAbandonedRenderIsNotLoggedAsSuccess(t *testing.T) {
	var buf bytes.Buffer
	var mu sync.Mutex
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&lockedWriter{w: &buf, mu: &mu},
		&slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	h, p := shedHandler(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodGet, "/poster/tt9001?config="+p.ID, nil).WithContext(ctx)
	req.RemoteAddr = "203.0.113.31:1234"
	req.Header.Set("User-Agent", "Mozilla/5.0")
	h.ServeHTTP(httptest.NewRecorder(), req)

	mu.Lock()
	out := buf.String()
	mu.Unlock()

	access := 0
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		var d map[string]any
		if json.Unmarshal([]byte(line), &d) != nil {
			continue
		}
		if fmt.Sprint(d["msg"]) != "Handled an HTTP request" {
			continue
		}
		if !strings.HasPrefix(fmt.Sprint(d["path"]), "/poster/") {
			continue
		}
		access++
		if got := fmt.Sprint(d["status"]); got != "499" {
			t.Errorf("access log status = %q for a request the caller abandoned, want 499", got)
		}
		if got := fmt.Sprint(d["bytes"]); got != "0" {
			t.Errorf("access log bytes = %q, want 0", got)
		}
	}
	if access == 0 {
		t.Fatal("no access line for the render, so this proves nothing")
	}
}

// The other place a caller can go away is while waiting on a render already in
// flight for the same key.
func TestAnAbandonedFlightWaiterIsNotLoggedAsSuccess(t *testing.T) {
	if testing.Short() {
		t.Skip("holds a render in flight")
	}
	var buf bytes.Buffer
	var mu sync.Mutex
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&lockedWriter{w: &buf, mu: &mu},
		&slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	hang := &hangingFetcher{}
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: "http://fake/poster.jpg"},
	})
	pipe := compose.NewWithFetcher(reg, hang)
	pipe.SetRenderQueueWait(2 * time.Second)
	c, err := cache.New(filepath.Join(t.TempDir(), "cache"), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", nil, nil, pipe, c, config.Config{RenderConcurrency: 4})

	const url = "/poster/tt0111161"
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, url, nil))
	}()
	for range 200 {
		if hang.calls.Load() > 0 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if hang.calls.Load() == 0 {
		t.Fatal("no render reached the fetcher, so nothing was in flight to wait on")
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	waiter := httptest.NewRequest(http.MethodGet, url, nil).WithContext(ctx)
	waiter.RemoteAddr = "203.0.113.32:1234"
	h.ServeHTTP(httptest.NewRecorder(), waiter)
	wg.Wait()

	mu.Lock()
	out := buf.String()
	mu.Unlock()

	waiters := 0
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		var d map[string]any
		if json.Unmarshal([]byte(line), &d) != nil {
			continue
		}
		if fmt.Sprint(d["msg"]) != "Handled an HTTP request" {
			continue
		}
		if fmt.Sprint(d["client_ip"]) != "203.0.113.32" {
			continue
		}
		waiters++
		if got := fmt.Sprint(d["status"]); got != "499" {
			t.Errorf("access log status = %q for a waiter the caller abandoned, want 499", got)
		}
	}
	if waiters == 0 {
		t.Fatal("no access line for the waiter, so this proves nothing")
	}
}
