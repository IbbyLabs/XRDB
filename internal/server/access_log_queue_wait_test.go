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

// Bursts finish in seconds and sheds are rare, so the queue wait rides a line
// that is always written rather than a sampled one. It is omitted when the
// request never reached the queue: a zero would otherwise mean both "waited no
// time" and "never waited", and averaging the two understates the wait.
func TestTheAccessLineCarriesTheQueueWaitOnlyWhenQueued(t *testing.T) {
	for _, tc := range []struct {
		name string
		path string
		want bool
	}{
		{"a render queues", "/poster/tt0111161", true},
		{"a non-render path does not", "/no-such-route", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			prev := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
			t.Cleanup(func() { slog.SetDefault(prev) })

			h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
			h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, tc.path, nil))

			var seen bool
			for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
				var d map[string]any
				if json.Unmarshal([]byte(line), &d) != nil || d["msg"] != "Handled an HTTP request" {
					continue
				}
				seen = true
				v, got := d["queue_wait_ms"]
				if got != tc.want {
					t.Errorf("%s: queue_wait_ms present=%v (value %v), want present=%v", tc.path, got, v, tc.want)
				}
			}
			if !seen {
				t.Fatalf("no access line was written at info; log was: %q", buf.String())
			}
		})
	}
}
