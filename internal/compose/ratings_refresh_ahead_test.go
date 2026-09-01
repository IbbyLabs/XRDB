package compose

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

func ratedAt(v float64) *provider.MediaMeta {
	return &provider.MediaMeta{Ratings: []provider.Rating{{Source: "imdb", Value: v}}}
}

// A render inside the refresh window is served the remembered answer and does
// not wait on the source; the fetch runs behind it (FR-201).
func TestAnEntryNearExpiryIsRefreshedBehindTheRender(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	c.entries["k"] = ratingsEntry{Meta: ratedAt(1), ExpiresAt: time.Now().Add(time.Minute)}

	var calls atomic.Int32
	done := make(chan struct{})
	meta, err := c.do(t.Context(), "k", func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		close(done)
		return ratedAt(2), true, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if meta.Ratings[0].Value != 1 {
		t.Errorf("the render waited on the refresh: got %v, want the remembered 1", meta.Ratings[0].Value)
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("no refresh ran behind the render")
	}
	waitForNoInflight(t, c, "k")

	c.mu.Lock()
	got := c.entries["k"].Meta.Ratings[0].Value
	c.mu.Unlock()
	if got != 2 {
		t.Errorf("the refreshed answer was not stored: got %v", got)
	}
}

// An entry with most of its term left must not be re-asked; that would spend a
// metered source on every render.
func TestAnEntryWellInsideItsTermIsNotRefreshed(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	c.entries["k"] = ratingsEntry{Meta: ratedAt(1), ExpiresAt: time.Now().Add(50 * time.Minute)}

	var calls atomic.Int32
	for range 5 {
		if _, err := c.do(t.Context(), "k", func(context.Context) (*provider.MediaMeta, bool, error) {
			calls.Add(1)
			return ratedAt(2), true, nil
		}); err != nil {
			t.Fatal(err)
		}
	}
	time.Sleep(100 * time.Millisecond)
	if n := calls.Load(); n != 0 {
		t.Errorf("%d fetches ran for an entry with most of its term left", n)
	}
}

// Concurrent renders inside the window share one refresh.
func TestConcurrentRendersTriggerOneRefresh(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	c.entries["k"] = ratingsEntry{Meta: ratedAt(1), ExpiresAt: time.Now().Add(time.Minute)}

	var calls atomic.Int32
	release := make(chan struct{})
	for range 20 {
		if _, err := c.do(t.Context(), "k", func(context.Context) (*provider.MediaMeta, bool, error) {
			calls.Add(1)
			<-release
			return ratedAt(2), true, nil
		}); err != nil {
			t.Fatal(err)
		}
	}
	close(release)
	waitForNoInflight(t, c, "k")
	if n := calls.Load(); n != 1 {
		t.Errorf("%d refreshes ran for one key, want 1", n)
	}
}

// The render that triggers a refresh returns immediately, so a refresh on its
// context would be cancelled before it reached the source.
func TestARefreshOutlivesTheRenderThatTriggeredIt(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	c.entries["k"] = ratingsEntry{Meta: ratedAt(1), ExpiresAt: time.Now().Add(time.Minute)}

	ctx, cancel := context.WithCancel(context.Background())
	seen := make(chan error, 1)
	if _, err := c.do(ctx, "k", func(fctx context.Context) (*provider.MediaMeta, bool, error) {
		time.Sleep(50 * time.Millisecond)
		seen <- fctx.Err()
		return ratedAt(2), true, nil
	}); err != nil {
		t.Fatal(err)
	}
	cancel() // the render is over

	select {
	case err := <-seen:
		if err != nil {
			t.Errorf("the refresh saw a cancelled context: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the refresh never ran")
	}
}

func waitForNoInflight(t *testing.T, c *ratingsCache, key string) {
	t.Helper()
	for range 200 {
		c.mu.Lock()
		_, running := c.inflight[key]
		c.mu.Unlock()
		if !running {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("a refresh never finished")
}

// A refresh runs off the render path, so its refusal reaches no hold-out line
// and no counter. Without this it is spend and contention with no trace.
func TestAFailedRefreshIsLogged(t *testing.T) {
	var buf bytes.Buffer
	const key = "wikidata|movie|tt1"
	c := newRatingsCache(time.Hour, slog.New(slog.NewJSONHandler(&buf, nil)))
	c.entries[key] = ratingsEntry{Meta: ratedAt(1), ExpiresAt: time.Now().Add(time.Minute)}

	done := make(chan struct{})
	if _, err := c.do(t.Context(), key, func(context.Context) (*provider.MediaMeta, bool, error) {
		defer close(done)
		return nil, false, provider.ErrPacerBacklog
	}); err != nil {
		t.Fatal(err)
	}
	<-done
	waitForNoInflight(t, c, key)

	line := buf.String()
	for _, want := range []string{"refresh_held_out", "pacer_backlog", "wikidata", "tt1"} {
		if !strings.Contains(line, want) {
			t.Errorf("the refusal line does not name %q: %s", want, line)
		}
	}
}
