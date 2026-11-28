package server

import (
	"bytes"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

func testDetector(t *testing.T, titles int, window time.Duration) (*unnamedSweepDetector, *time.Time, *bytes.Buffer) {
	t.Helper()
	var buf bytes.Buffer
	t.Setenv("XRDB_UNNAMED_SWEEP_TITLES", fmt.Sprint(titles))
	t.Setenv("XRDB_UNNAMED_SWEEP_WINDOW_MS", fmt.Sprint(window.Milliseconds()))
	t.Setenv("XRDB_UNNAMED_SWEEP_ENFORCE", "1")
	d := newUnnamedSweepDetector(slog.New(slog.NewTextHandler(&buf, nil)))
	now := time.Unix(1_800_000_000, 0)
	d.now = func() time.Time { return now }
	return d, &now, &buf
}

func TestUnnamedSweepDetectorFlagsASweepRateOnly(t *testing.T) {
	d, now, logs := testDetector(t, 5, 10*time.Second)
	for i := 0; i < 4; i++ {
		if d.sweeping("203.0.113.9", fmt.Sprintf("/poster/tt%d.jpg", i)) {
			t.Fatalf("flagged after %d titles, want only from the 5th", i+1)
		}
	}
	if d.sweeping("203.0.113.9", "/poster/tt0.jpg") {
		t.Fatal("a repeated title counted as a new one")
	}
	if !d.sweeping("203.0.113.9", "/poster/tt4.jpg") {
		t.Fatal("5 distinct titles in the window were not flagged")
	}
	if d.sweeping("198.51.100.1", "/poster/tt9.jpg") {
		t.Fatal("another address was flagged by the first one's rate")
	}
	if got := strings.Count(logs.String(), "at a sweep's rate"); got != 1 {
		t.Fatalf("crossing logged %d times, want once", got)
	}
	*now = now.Add(11 * time.Second)
	if d.sweeping("203.0.113.9", "/poster/tt10.jpg") {
		t.Fatal("still flagged after the window passed")
	}
}

func TestUnnamedSweepDetectorKeysIPv6ByPrefix(t *testing.T) {
	d, _, _ := testDetector(t, 3, 10*time.Second)
	d.sweeping("2001:db8:1:2::1", "/poster/a.jpg")
	d.sweeping("2001:db8:1:2::2", "/poster/b.jpg")
	if !d.sweeping("2001:db8:1:2:ffff::3", "/poster/c.jpg") {
		t.Fatal("titles spread across one /64 were not counted together")
	}
}

func TestUnnamedSweepDetectorOffAtZero(t *testing.T) {
	d, _, _ := testDetector(t, 0, 10*time.Second)
	for i := 0; i < 100; i++ {
		if d.sweeping("203.0.113.9", fmt.Sprintf("/poster/tt%d.jpg", i)) {
			t.Fatal("flagged with the detector turned off")
		}
	}
}

func TestUnnamedSweepDetectorForgetsIdleCallers(t *testing.T) {
	d, now, _ := testDetector(t, 3, time.Second)
	d.sweeping("203.0.113.9", "/poster/a.jpg")
	*now = now.Add(3 * time.Second)
	d.sweeping("198.51.100.1", "/poster/a.jpg")
	if len(d.callers) != 1 {
		t.Fatalf("holding %d callers, want the idle one dropped", len(d.callers))
	}
}

func TestUnnamedSweepDetectorOnlyLogsByDefault(t *testing.T) {
	var buf bytes.Buffer
	t.Setenv("XRDB_UNNAMED_SWEEP_TITLES", "3")
	t.Setenv("XRDB_UNNAMED_SWEEP_ENFORCE", "")
	d := newUnnamedSweepDetector(slog.New(slog.NewTextHandler(&buf, nil)))
	for i := 0; i < 5; i++ {
		if d.sweeping("203.0.113.9", fmt.Sprintf("/poster/tt%d.jpg", i)) {
			t.Fatal("reclassified a caller without enforce set")
		}
	}
	if !strings.Contains(buf.String(), "paced_as_sweep=false") {
		t.Fatalf("the crossing was not logged: %s", buf.String())
	}
}

func TestAccessLogPacesAnUnnamedSweepAsBulk(t *testing.T) {
	t.Setenv("XRDB_UNNAMED_SWEEP_TITLES", "3")
	t.Setenv("XRDB_UNNAMED_SWEEP_ENFORCE", "1")
	var last provider.CallerClass
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { last = provider.CallerClassFrom(r.Context()) })
	h := accessLogMiddleware(slog.New(slog.DiscardHandler), proxyTrust{}, inner)
	get := func(path, ua string) provider.CallerClass {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.RemoteAddr = "203.0.113.9:4000"
		req.Header.Set("User-Agent", ua)
		h.ServeHTTP(httptest.NewRecorder(), req)
		return last
	}
	if got := get("/poster/tt1.jpg", ""); got != provider.CallerUnknown {
		t.Fatalf("first unnamed request classed %v, want unknown", got)
	}
	get("/poster/tt2.jpg", "")
	if got := get("/poster/tt3.jpg", ""); got != provider.CallerBulk {
		t.Fatalf("unnamed caller past the rate classed %v, want bulk", got)
	}
	if got := get("/poster/tt4.jpg", "Stremio/1.0"); got != provider.CallerInteractive {
		t.Fatalf("a named person from the same address classed %v, want interactive", got)
	}
	if got := get("/configure", ""); got != provider.CallerUnknown {
		t.Fatalf("a non-render path classed %v, want unknown", got)
	}
}
