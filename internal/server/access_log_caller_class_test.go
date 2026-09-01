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

// A hold-out count and a render count are only comparable when both name the
// caller the same way. The compose lines take the class from the context, so
// the access line takes it from there too rather than reading the agent again.
func TestTheAccessLineNamesTheCallerClass(t *testing.T) {
	for _, tc := range []struct {
		name string
		ua   string
		want string
	}{
		{"a recognised sweep", "AIOMetadata/1.4.0", "bulk"},
		{"an ordinary client", "Stremio/4.4.142 okhttp/4.9.2", "interactive"},
		{"no agent at all", "", "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			prev := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
			t.Cleanup(func() { slog.SetDefault(prev) })

			req := httptest.NewRequest(http.MethodGet, "/poster/tt0111161", nil)
			if tc.ua != "" {
				req.Header.Set("User-Agent", tc.ua)
			} else {
				req.Header.Del("User-Agent")
			}
			h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
			h.ServeHTTP(httptest.NewRecorder(), req)

			var seen bool
			for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
				var d map[string]any
				if json.Unmarshal([]byte(line), &d) != nil || d["msg"] != "Handled an HTTP request" {
					continue
				}
				seen = true
				if got := d["caller_class"]; got != tc.want {
					t.Errorf("caller_class = %v, want %q", got, tc.want)
				}
			}
			if !seen {
				t.Fatalf("no access line was written at info; log was: %q", buf.String())
			}
		})
	}
}
