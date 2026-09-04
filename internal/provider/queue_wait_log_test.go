package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"
)

// A slow source and a long queue in front of a fast one are the same number to
// the caller, and they want opposite responses. The queue wait has to be
// countable on its own.
func TestAQueuedRequestReportsTheWaitApartFromTheCall(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	g := newBudgetGovernor("mdblist")
	g.rate = 4 // 250ms a token once the burst is gone
	for range int(g.burst) + 1 {
		g.take(0, false)
	}
	c := &http.Client{Transport: &throttledTransport{
		base:     &headerTransport{header: make(http.Header)},
		source:   "mdblist",
		policy:   RateLimit{MaxRetries: 0},
		pacer:    &pacer{},
		governor: g,
		logger:   logger,
	}}
	resp, err := c.Get("http://example.invalid/x")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()

	var line map[string]any
	for _, raw := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if raw == "" {
			continue
		}
		var l map[string]any
		if err := json.Unmarshal([]byte(raw), &l); err != nil {
			t.Fatalf("not JSON: %s", raw)
		}
		if l["msg"] == "A ratings source's requests are waiting in our own queue" {
			line = l
		}
	}
	if line == nil {
		t.Fatal("a request that waited in our queue left no record, so the wait cannot be told from a slow source")
	}
	if line["source"] != "mdblist" {
		t.Errorf("source = %v, want mdblist", line["source"])
	}
	q, ok := line["queue_ms"].(float64)
	if !ok || q <= 0 {
		t.Errorf("queue_ms = %v, want a positive wait", line["queue_ms"])
	}
	if _, ok := line["upstream_ms"]; !ok {
		t.Error("upstream_ms is missing, so the queue cannot be compared with the call")
	}
}

// A request that goes straight out must not be reported as queued, or the
// count means nothing.
func TestAnUnqueuedRequestIsNotReported(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	c := &http.Client{Transport: &throttledTransport{
		base:   &headerTransport{header: make(http.Header)},
		source: "trakt",
		policy: RateLimit{MaxRetries: 0},
		pacer:  &pacer{},
		logger: logger,
	}}
	resp, err := c.Get("http://example.invalid/x")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()
	if strings.Contains(buf.String(), "waiting in our own queue") {
		t.Errorf("a request that did not wait was reported as queued: %s", buf.String())
	}
	_ = time.Second
}

// panelLines returns the parsed log lines whose message matches.
func logLinesWithMessage(t *testing.T, raw, msg string) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(raw), "\n") {
		if line == "" {
			continue
		}
		var l map[string]any
		if err := json.Unmarshal([]byte(line), &l); err != nil {
			t.Fatalf("not JSON: %s", line)
		}
		if l["msg"] == msg {
			out = append(out, l)
		}
	}
	return out
}

// The pacer's wait is our queue as much as the governor's is. A figure that
// starts after the pacer describes a queue nobody stood in, and on a source
// paced by interval alone it reads as no wait at all.
func TestTheReportedWaitIncludesThePacersOwn(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	const paced = 120 * time.Millisecond
	// next in the future is a slot already claimed, which is what a second
	// request against a paced source meets.
	p := &pacer{interval: paced, next: time.Now().Add(paced), maxWait: time.Second}
	c := &http.Client{Transport: &throttledTransport{
		base:   &headerTransport{header: make(http.Header)},
		source: "mdblist",
		policy: RateLimit{MaxRetries: 0},
		pacer:  p,
		logger: logger,
	}}
	resp, err := c.Get("http://example.invalid/x")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()

	lines := logLinesWithMessage(t, buf.String(), "A ratings source's requests are waiting in our own queue")
	if len(lines) == 0 {
		t.Fatal("a request held by the pacer left no queue record")
	}
	q, ok := lines[0]["queue_ms"].(float64)
	if !ok {
		t.Fatalf("queue_ms = %v, want a number", lines[0]["queue_ms"])
	}
	// Half the pace rather than all of it: the assertion is that the pacer's
	// wait is counted at all, and a tighter bound would fail on timer slack.
	if want := float64(paced.Milliseconds()) / 2; q < want {
		t.Errorf("queue_ms = %v, want at least %v with a %v pace", q, want, paced)
	}
}

// A caller that gives up while queued leaves no trace of its own: the render
// reports a failure and nothing says it failed waiting for us.
func TestARequestAbandonedInTheQueueIsRecorded(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	p := &pacer{interval: time.Minute, next: time.Now().Add(time.Minute), maxWait: time.Hour}
	c := &http.Client{Transport: &throttledTransport{
		base:   &headerTransport{header: make(http.Header)},
		source: "mdblist",
		policy: RateLimit{MaxRetries: 0},
		pacer:  p,
		logger: logger,
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://example.invalid/x", nil)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	if resp, err := c.Do(req); err == nil {
		resp.Body.Close()
		t.Fatal("a request that could not be paced within its deadline succeeded")
	}

	lines := logLinesWithMessage(t, buf.String(), "A request was given up on while waiting in our own queue")
	if len(lines) != 1 {
		t.Fatalf("an abandoned request left %d records, want 1: %s", len(lines), buf.String())
	}
	if lines[0]["source"] != "mdblist" {
		t.Errorf("source = %v, want mdblist", lines[0]["source"])
	}
	if lines[0]["stage"] != "pacer" {
		t.Errorf("stage = %v, want pacer", lines[0]["stage"])
	}
	if _, ok := lines[0]["waited_ms"].(float64); !ok {
		t.Errorf("waited_ms = %v, want a number", lines[0]["waited_ms"])
	}
}
