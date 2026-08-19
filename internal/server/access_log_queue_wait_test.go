package server

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
)

// Bursts finish in seconds and sheds are rare, so the queue wait has to ride a
// line that is always written rather than a sampled one. It was on the render
// line at debug, which production never emits.
func TestTheAccessLineCarriesTheQueueWait(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0111161", nil))

	var found bool
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		var d map[string]any
		if json.Unmarshal([]byte(line), &d) != nil {
			continue
		}
		if d["msg"] != "Handled an HTTP request" {
			continue
		}
		found = true
		if _, ok := d["queue_wait_ms"]; !ok {
			t.Errorf("the access line has no queue_wait_ms; keys were: %v", keysOf(d))
		}
	}
	if !found {
		t.Fatalf("no access line was written at info; log was: %q", buf.String())
	}
}

func keysOf(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
