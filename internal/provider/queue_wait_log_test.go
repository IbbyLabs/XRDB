package provider

import (
	"bytes"
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
		g.take(-1)
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
