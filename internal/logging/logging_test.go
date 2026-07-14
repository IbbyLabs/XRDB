package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/url"
	"strings"
	"testing"
)

func TestRedactQueryHidesSecrets(t *testing.T) {
	in := "config=my-profile&key=supersecret&token=abc123&cb=1"
	out := RedactQuery(in)
	if strings.Contains(out, "supersecret") || strings.Contains(out, "abc123") {
		t.Fatalf("secret leaked in redacted query: %q", out)
	}
	v, err := url.ParseQuery(out)
	if err != nil {
		t.Fatalf("redacted query is unparseable: %v", err)
	}
	if v.Get("config") != "my-profile" {
		t.Errorf("non-sensitive param dropped: config=%q", v.Get("config"))
	}
	if v.Get("key") != "REDACTED" || v.Get("token") != "REDACTED" {
		t.Errorf("sensitive params not redacted: %v", v)
	}
}

func TestRedactQueryEmptyAndBad(t *testing.T) {
	if RedactQuery("") != "" {
		t.Error("empty query should stay empty")
	}
	// A key with no value still parses; ensure no panic and a string is returned.
	if got := RedactQuery("key"); strings.Contains(got, "key") && !strings.Contains(got, "REDACTED") {
		t.Errorf("bare sensitive key not handled: %q", got)
	}
}

func TestRequestIDRoundTrip(t *testing.T) {
	if RequestID(context.Background()) != "" {
		t.Error("empty context should have no request id")
	}
	id := NewRequestID()
	if id == "" || id == "unknown" {
		t.Fatalf("bad request id: %q", id)
	}
	ctx := WithRequestID(context.Background(), id)
	if RequestID(ctx) != id {
		t.Errorf("request id not round-tripped: got %q want %q", RequestID(ctx), id)
	}
}

func TestNewLevelGating(t *testing.T) {
	var buf bytes.Buffer
	h := slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn})
	l := slog.New(h)
	l.Info("info-line")
	l.Warn("warn-line")
	if strings.Contains(buf.String(), "info-line") {
		t.Error("info line emitted at warn level")
	}
	if !strings.Contains(buf.String(), "warn-line") {
		t.Error("warn line missing")
	}
	// Sanity: output is valid JSON.
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Errorf("log line is not JSON: %q", line)
		}
	}
}
