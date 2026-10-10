package provider

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func refusedOnce(t *testing.T, source string) map[string]any {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Retry-After", "120")
		w.Header().Set("X-Served-By", "edge-test")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte("<html><body><h1>Too Many Requests</h1><p>Rate limit exceeded</p></body></html>"))
	}))
	t.Cleanup(srv.Close)
	var buf bytes.Buffer
	tr := &throttledTransport{
		source: source,
		policy: RateLimit{MaxRetryWait: time.Second},
		pacer:  &pacer{source: source},
		logger: slog.New(slog.NewJSONHandler(&buf, nil)),
	}
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	if _, err := tr.RoundTrip(req); err == nil {
		t.Fatal("a 429 with a long Retry-After returned no error")
	}
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		var m map[string]any
		if json.Unmarshal([]byte(line), &m) == nil && m["msg"] == "A ratings source is rate limiting us and did not recover" {
			return m
		}
	}
	t.Fatalf("no refusal line in:\n%s", buf.String())
	return nil
}

// A refusal names how many requests were open, which edge answered, and for a
// keyless source the words it refused with.
func TestARefusalSaysWhatWasOpenAndWhatTheSourceSaid(t *testing.T) {
	m := refusedOnce(t, "wikidata")
	if m["in_flight_at_send"] != float64(1) {
		t.Errorf("in_flight_at_send = %v, want 1", m["in_flight_at_send"])
	}
	if m["served_by"] != "edge-test" {
		t.Errorf("served_by = %v", m["served_by"])
	}
	if got, _ := m["refusal"].(string); !strings.Contains(got, "Rate limit exceeded") || strings.Contains(got, "<") {
		t.Errorf("refusal = %q, want the page text without markup", got)
	}
}

func TestARefusalBodyIsNotQuotedForASourceThatTakesAKey(t *testing.T) {
	m := refusedOnce(t, "mdblist")
	if got, _ := m["refusal"].(string); got != "" {
		t.Errorf("refusal = %q for a keyed source, want nothing", got)
	}
}
