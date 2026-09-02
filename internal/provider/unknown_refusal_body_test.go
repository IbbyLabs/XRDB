package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func refusalLines(buf *bytes.Buffer) []map[string]any {
	var out []map[string]any
	for _, line := range strings.Split(buf.String(), "\n") {
		if line == "" {
			continue
		}
		var rec map[string]any
		if json.Unmarshal([]byte(line), &rec) != nil {
			continue
		}
		if s, _ := rec["msg"].(string); strings.Contains(s, "none of the quota phrases match") {
			out = append(out, rec)
		}
	}
	return out
}

func reportRefusal(t *testing.T, bodies ...string) []map[string]any {
	t.Helper()
	buf := &bytes.Buffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	tr := &throttledTransport{source: "allocine"}
	for _, b := range bodies {
		tr.reportUnknownRefusal(context.Background(), 429, []byte(b))
	}
	return refusalLines(buf)
}

// The quota list grows only when someone reads a source's wording, and an
// unrecognised quota refusal looks exactly like ordinary throttling.
func TestAnUnmatchedStructuredRefusalIsReported(t *testing.T) {
	lines := reportRefusal(t, `{"erreur":"quota journalier depasse"}`)
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want one: %v", len(lines), lines)
	}
	if body, _ := lines[0]["body"].(string); !strings.Contains(body, "quota journalier") {
		t.Errorf("body = %q, want the source's wording", body)
	}
	if lines[0]["level"] != "INFO" {
		t.Errorf("level = %v, want INFO — the point is that it can be read", lines[0]["level"])
	}
}

// 512 bytes of an HTML block page is neither useful nor obviously safe.
func TestAnUnstructuredRefusalIsNotLogged(t *testing.T) {
	for _, body := range []string{
		"<html><head><title>403 Forbidden</title></head>",
		"Too Many Requests",
		"",
		"   ",
	} {
		if lines := reportRefusal(t, body); len(lines) != 0 {
			t.Errorf("body %q was logged: %v", body, lines)
		}
	}
}

// A throttled source produces these in bulk and the wording does not vary.
func TestAnUnmatchedRefusalIsReportedOncePerSource(t *testing.T) {
	lines := reportRefusal(t,
		`{"erreur":"quota"}`, `{"erreur":"quota"}`, `{"erreur":"quota"}`, `{"erreur":"quota"}`)
	if len(lines) != 1 {
		t.Errorf("got %d lines, want one per source: %v", len(lines), lines)
	}
}

// Leading whitespace is common in a pretty-printed error body and must not
// decide whether it is structured.
func TestLeadingWhitespaceDoesNotHideAStructuredBody(t *testing.T) {
	if lines := reportRefusal(t, "\n  {\"error\":\"nope\"}"); len(lines) != 1 {
		t.Errorf("a padded JSON body was not reported: %v", lines)
	}
}

// A 503 is the source being unwell rather than an allowance being spent, so its
// body is not evidence about quota wording.
func TestAServiceUnavailableBodyIsNotReported(t *testing.T) {
	buf := &bytes.Buffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	tr := &throttledTransport{source: "allocine"}
	tr.reportUnknownRefusal(context.Background(), 503, []byte(`{"error":"maintenance"}`))

	if lines := refusalLines(buf); len(lines) != 0 {
		t.Errorf("a 503 body was reported as quota evidence: %v", lines)
	}
}
