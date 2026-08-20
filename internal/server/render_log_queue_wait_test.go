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

// The render line and the access line describe one request, so they carry the
// queue wait on the same terms. The case that made them disagree is a cache
// hit, which reaches the render log without touching the limiter; it needs a
// render pipeline to reproduce, so this covers the paths that do queue and the
// cache hit is checked against the dev container's logs.
func TestBothLogLinesAgreeAboutTheQueueWait(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	for _, path := range []string{"/poster/tt0111161", "/poster/tt0111161", "/poster/tt9999999"} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, path, nil))
	}

	access := map[string]bool{}
	render := map[string]bool{}
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		var d map[string]any
		if json.Unmarshal([]byte(line), &d) != nil {
			continue
		}
		id, _ := d["id"].(string)
		if id == "" {
			continue
		}
		_, has := d["queue_wait_ms"]
		switch d["msg"] {
		case "Handled an HTTP request":
			access[id] = has
		case "Served an artwork render":
			render[id] = has
		}
	}

	var compared int
	for id, r := range render {
		a, ok := access[id]
		if !ok {
			continue
		}
		compared++
		if a != r {
			t.Errorf("request %s: access line has=%v, render line has=%v", id, a, r)
		}
	}
	if compared == 0 {
		t.Fatalf("no request produced both lines; log was: %q", buf.String())
	}
}
