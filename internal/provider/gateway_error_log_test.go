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

// statusTransport answers every request with a fixed status.
type statusTransport struct{ status int }

func (s *statusTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return &http.Response{StatusCode: s.status, Body: http.NoBody, Header: make(http.Header)}, nil
}

func gatewayLogLines(t *testing.T, status int, url string) []map[string]any {
	t.Helper()
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	c := &http.Client{Transport: &throttledTransport{
		base:   &statusTransport{status: status},
		source: "mal",
		policy: RateLimit{MaxRetries: 0, MaxRetryWait: time.Second},
		pacer:  &pacer{},
		logger: logger,
	}}
	// A throttled status comes back as a typed error rather than a response;
	// either way the log is what is under test.
	if resp, err := c.Get(url); err == nil {
		resp.Body.Close()
	}

	var lines []map[string]any
	for _, raw := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if raw == "" {
			continue
		}
		var line map[string]any
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			t.Fatalf("log line is not JSON: %s", raw)
		}
		lines = append(lines, line)
	}
	return lines
}

func findMsg(lines []map[string]any, msg string) map[string]any {
	for _, l := range lines {
		if l["msg"] == msg {
			return l
		}
	}
	return nil
}

const gatewayMsg = "A ratings source returned a gateway error"

// A 504 is not a throttle, so it is not retried and carries no Retry-After. It
// leaves no trace at all otherwise: the caller turns it into a plain error and
// five of them hold the source out with nothing in the log to count.
func TestAGatewayErrorIsLogged(t *testing.T) {
	line := findMsg(gatewayLogLines(t, http.StatusGatewayTimeout,
		"http://example.invalid/v4/anime/9253"), gatewayMsg)
	if line == nil {
		t.Fatal("a 504 left no record")
	}
	if line["source"] != "mal" {
		t.Errorf("source = %v, want mal", line["source"])
	}
	if line["status"] != float64(504) {
		t.Errorf("status = %v, want 504", line["status"])
	}
	if line["path"] != "/v4/anime/9253" {
		t.Errorf("path = %v, want the request path", line["path"])
	}
}

// A credential in the query string must not reach the log.
func TestAGatewayErrorLogsNoQueryString(t *testing.T) {
	lines := gatewayLogLines(t, http.StatusBadGateway,
		"http://example.invalid/imdb/movie/tt1?apikey=SECRET123")
	line := findMsg(lines, gatewayMsg)
	if line == nil {
		t.Fatal("a 502 left no record")
	}
	for k, v := range line {
		if s, ok := v.(string); ok && strings.Contains(s, "SECRET123") {
			t.Errorf("field %q carries the credential: %v", k, v)
		}
	}
}

// An ordinary answer is not a gateway error, and a throttle has its own lines.
func TestOnlyAGatewayErrorIsLoggedAsOne(t *testing.T) {
	for _, status := range []int{http.StatusOK, http.StatusNotFound, http.StatusTooManyRequests} {
		lines := gatewayLogLines(t, status, "http://example.invalid/x")
		if line := findMsg(lines, gatewayMsg); line != nil {
			t.Errorf("http %d was logged as a gateway error: %v", status, line)
		}
	}
}
