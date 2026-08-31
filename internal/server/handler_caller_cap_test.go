package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
)

// capHandler builds a handler with a small render cap so the limit is reachable
// in a test.
func capHandler(t *testing.T, perMinute int) (http.Handler, *profile.Profile) {
	t.Helper()
	art := testSourcePNG(t, 300, 450)
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	})
	pipeline := compose.NewWithFetcher(reg, logoFailingFetcher{data: art})

	store := openTestStore(t)
	c, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", store, nil, pipeline, c, config.Config{
		RenderCapPerMinute: perMinute,
		CacheTTL:           72 * time.Hour,
		// The metrics route refuses without a key, and this helper's callers
		// read metrics to check what was recorded.
		AdminKey: "test-admin-key",
	})
	p := &profile.Profile{ID: "cap-cfg", Type: "poster", Config: json.RawMessage(`{}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	return h, p
}

// A caller past its allowance is refused at the door rather than after the
// render queue, so the refusal costs it nothing to receive. The allowance a
// burst may spend at once is twice the per-minute rate, so a rate of 2 admits
// 4 before it refuses.
func TestACallerPastItsAllowanceIsRefused(t *testing.T) {
	h, p := capHandler(t, 2)

	codes := []int{}
	for i := range 6 {
		rr := httptest.NewRecorder()
		// A distinct title each time so no request is answered from the cache.
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt000"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = "203.0.113.9:1234"
		h.ServeHTTP(rr, req)
		codes = append(codes, rr.Code)
	}
	for i, c := range codes[:4] {
		if c != http.StatusOK {
			t.Fatalf("request %d of the allowance returned %d, want 200 (all: %v)", i+1, c, codes)
		}
	}
	if codes[4] != http.StatusTooManyRequests || codes[5] != http.StatusTooManyRequests {
		t.Errorf("requests past the allowance returned %v, want 429", codes[4:])
	}
}

// The refusal has to say when to come back and must not be held anywhere.
func TestARefusedCallerIsToldWhenToReturn(t *testing.T) {
	h, p := capHandler(t, 1) // burst 2, so the third is refused
	for i := range 3 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt100"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = "203.0.113.10:1234"
		h.ServeHTTP(rr, req)
		if i == 2 {
			if rr.Code != http.StatusTooManyRequests {
				t.Fatalf("got %d, want 429", rr.Code)
			}
			if rr.Header().Get("Retry-After") == "" {
				t.Error("a refusal carried no Retry-After")
			}
			if cc := rr.Header().Get("Cache-Control"); cc != "no-store" {
				t.Errorf("Cache-Control = %q, want no-store", cc)
			}
		}
	}
}

// A warm catalogue reload costs a cache read, not a render, so it is not what
// the cap exists to hold back.
func TestACacheHitIsNotCapped(t *testing.T) {
	h, p := capHandler(t, 1)

	first := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/poster/tt2001?config="+p.ID, nil)
	req.RemoteAddr = "203.0.113.11:1234"
	h.ServeHTTP(first, req)
	if first.Code != http.StatusOK {
		t.Fatalf("the first render returned %d", first.Code)
	}

	for i := range 5 {
		rr := httptest.NewRecorder()
		again := httptest.NewRequest(http.MethodGet, "/poster/tt2001?config="+p.ID, nil)
		again.RemoteAddr = "203.0.113.11:1234"
		h.ServeHTTP(rr, again)
		if rr.Code != http.StatusOK {
			t.Fatalf("cache hit %d returned %d, want 200", i+1, rr.Code)
		}
	}
}

// Zero leaves the cap off entirely, which is what an instance that has never
// configured it runs.
func TestNoCapConfiguredRefusesNothing(t *testing.T) {
	h, p := capHandler(t, 0)
	for i := range 6 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt300"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = "203.0.113.12:1234"
		h.ServeHTTP(rr, req)
		if rr.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d was capped with no cap configured", i+1)
		}
	}
}

// A peer address carries a port that changes with every connection. Keying on
// it identifies a connection rather than a caller, so every request mints a
// fresh bucket and the cap counts nothing while looking installed.
func TestTheAddressCapSurvivesAChangingPort(t *testing.T) {
	h, p := capHandler(t, 1) // burst 2, so the third is refused

	codes := []int{}
	for i := range 4 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt400"+string(rune('1'+i))+"?config=", nil)
		// Same caller, a new source port each time, which is what a fresh TCP
		// connection looks like.
		req.RemoteAddr = "198.51.100.7:" + string(rune('1'+i)) + "0000"
		h.ServeHTTP(rr, req)
		codes = append(codes, rr.Code)
	}
	_ = p
	if codes[2] != http.StatusTooManyRequests || codes[3] != http.StatusTooManyRequests {
		t.Errorf("a caller reconnecting on a new port was never capped: %v", codes)
	}
}

// The same, straight at the helper: two peers differing only in port are one
// caller.
func TestAPeerAddressLosesItsPort(t *testing.T) {
	var trust proxyTrust
	for _, tc := range []struct{ in, want string }{
		{"78.88.5.164:54321", "78.88.5.164"},
		{"78.88.5.164:1", "78.88.5.164"},
		{"[2606:4700::1]:443", "2606:4700::1"},
	} {
		r := httptest.NewRequest(http.MethodGet, "/poster/tt1", nil)
		r.RemoteAddr = tc.in
		if got := clientIP(r, trust); got != tc.want {
			t.Errorf("clientIP(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// A refusal the caller sees has to reach the metrics surface too. Anything
// reading /api/admin/metrics is the only view an operator or an alert has, and
// a 429 missing from it reads as a quiet minute rather than as a caller being
// turned away.
func TestARefusedCallerIsRecordedInMetrics(t *testing.T) {
	h, p := capHandler(t, 2)

	refused := 0
	for i := range 6 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt000"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = "203.0.113.9:1234"
		h.ServeHTTP(rr, req)
		if rr.Code == http.StatusTooManyRequests {
			refused++
		}
	}
	if refused == 0 {
		t.Fatal("no request was refused, so this proves nothing about recording one")
	}

	rr := httptest.NewRecorder()
	metricsReq := httptest.NewRequest(http.MethodGet, "/api/admin/metrics", nil)
	metricsReq.Header.Set("Authorization", "Bearer test-admin-key")
	h.ServeHTTP(rr, metricsReq)
	if rr.Code != http.StatusOK {
		t.Fatalf("metrics returned %d, want 200", rr.Code)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "429") {
		t.Errorf("%d refusals were served and none reached the metrics surface: %s", refused, body)
	}
}

// A shed on the burst ceiling and a shed on the ordinary one have different
// causes. The message names one of them, so an alert reading the message alone
// attributes every shed to a full queue.
func TestAShedNamesWhichCeilingTurnedItAway(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	h, p := capHandler(t, 2)
	for i := range 8 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt100"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = "203.0.113.9:1234"
		h.ServeHTTP(rr, req)
	}

	out := buf.String()
	if !strings.Contains(out, "allowance") {
		t.Fatalf("no caller was refused, so this proves nothing about the field: %s", out)
	}
	if strings.Contains(out, "Shed a render") && !strings.Contains(out, "queue_tier") {
		t.Error("a shed was logged without naming which ceiling turned it away")
	}
}

// The cap turns callers away before the queue reads their class, so the refusal
// line is the only place that can say whether it landed on a sweep or on
// somebody's library (FR-195). A user agent that names itself a sweep must come
// through as one.
func TestACapRefusalNamesTheCallerClass(t *testing.T) {
	// A recognised sweep is exempt from the cap (BUG-263), so it cannot produce
	// a refusal to name. What is left is a caller that named itself and one that
	// did not, and the field must tell them apart.
	for _, tc := range []struct {
		name      string
		userAgent string
		want      string
	}{
		{"a browser", "Mozilla/5.0", "interactive"},
		{"an unnamed client", "", "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			prev := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
			t.Cleanup(func() { slog.SetDefault(prev) })

			h, p := capHandler(t, 1) // burst 2, so the third is refused
			for i := range 3 {
				rr := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodGet,
					"/poster/tt000"+string(rune('1'+i))+"?config="+p.ID, nil)
				req.RemoteAddr = "203.0.113.11:1234"
				req.Header.Set("User-Agent", tc.userAgent)
				h.ServeHTTP(rr, req)
			}

			var seen bool
			for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
				var d map[string]any
				if json.Unmarshal([]byte(line), &d) != nil {
					continue
				}
				if !strings.Contains(fmt.Sprint(d["msg"]), "more renders than its allowance") {
					continue
				}
				seen = true
				if got := fmt.Sprint(d["caller_class"]); got != tc.want {
					t.Errorf("caller_class = %q, want %q", got, tc.want)
				}
			}
			if !seen {
				t.Fatal("no cap refusal was logged, so the field could not be checked")
			}
		})
	}
}

// A sweep that names itself is carried by the queue's bulk ceiling, which makes
// it wait. The cap sits in front of that ceiling, so capping the sweep refuses
// the one caller the ceiling exists for (BUG-263).
func TestARecognisedSweepIsNotCapped(t *testing.T) {
	h, p := capHandler(t, 1) // burst 2, so an unexempt caller is refused at the third

	for i := range 6 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt000"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = "203.0.113.21:1234"
		req.Header.Set("User-Agent", "AIOMetadata/2.13.0")
		h.ServeHTTP(rr, req)
		if rr.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d of a recognised sweep was capped", i+1)
		}
	}
}

// And the exemption must not spend the allowance on its way past. The address
// bucket is shared with everyone behind that address, so a sweep that drew it
// down would refuse a person who never exceeded anything.
func TestAnExemptSweepDoesNotSpendTheAddressAllowance(t *testing.T) {
	h, p := capHandler(t, 1) // burst 2
	const addr = "203.0.113.22:1234"

	for i := range 6 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt100"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = addr
		req.Header.Set("User-Agent", "AIOMetadata/2.13.0")
		h.ServeHTTP(rr, req)
	}

	// Same address, a person this time. The burst of 2 must still be theirs.
	for i := range 2 {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet,
			"/poster/tt200"+string(rune('1'+i))+"?config="+p.ID, nil)
		req.RemoteAddr = addr
		req.Header.Set("User-Agent", "Mozilla/5.0")
		h.ServeHTTP(rr, req)
		if rr.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d from a person was refused; the sweep spent the address allowance", i+1)
		}
	}
}

// Both classes reach the shed, so unlike the cap refusal this line's caller
// class varies and can be read (FR-196). Citing its absence as evidence about
// who was shed is what this exists to prevent.
func TestAShedNamesTheCallerClass(t *testing.T) {
	var buf bytes.Buffer
	var mu sync.Mutex
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&lockedWriter{w: &buf, mu: &mu},
		&slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	h, p := shedHandler(t)

	// One slot and a queue that will not wait, so whichever requests lose the
	// race are shed rather than served.
	var wg sync.WaitGroup
	for i := range 8 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet,
				"/poster/tt900"+string(rune('1'+i))+"?config="+p.ID, nil)
			req.RemoteAddr = "203.0.113.31:1234"
			req.Header.Set("User-Agent", "Mozilla/5.0")
			h.ServeHTTP(rr, req)
		}(i)
	}
	wg.Wait()

	mu.Lock()
	out := buf.String()
	mu.Unlock()

	shed := 0
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		var d map[string]any
		if json.Unmarshal([]byte(line), &d) != nil {
			continue
		}
		if !strings.HasPrefix(fmt.Sprint(d["msg"]), "Shed a render") {
			continue
		}
		shed++
		if got := fmt.Sprint(d["caller_class"]); got != "interactive" {
			t.Errorf("shed line caller_class = %q, want interactive", got)
		}
	}
	if shed == 0 {
		t.Fatal("no render was shed, so this proves nothing about the field")
	}
}

// lockedWriter serialises the log writes the concurrent requests above produce.
type lockedWriter struct {
	w  *bytes.Buffer
	mu *sync.Mutex
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}

// shedHandler builds a handler with one render slot and a queue that will not
// wait, so a burst is shed rather than served.
func shedHandler(t *testing.T) (http.Handler, *profile.Profile) {
	t.Helper()
	art := testSourcePNG(t, 300, 450)
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"},
	})
	pipeline := compose.NewWithFetcher(reg, logoFailingFetcher{data: art})
	store := openTestStore(t)
	c, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := NewHandler("test", store, nil, pipeline, c, config.Config{
		RenderConcurrency: 1,
		RenderQueueWait:   time.Millisecond,
		CacheTTL:          72 * time.Hour,
	})
	p := &profile.Profile{ID: "shed-cfg", Type: "poster", Config: json.RawMessage(`{}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	return h, p
}
