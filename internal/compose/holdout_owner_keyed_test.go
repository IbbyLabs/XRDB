package compose

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"xrdb_rewrite/internal/provider"
)

func holdOutLines(buf *bytes.Buffer) []map[string]any {
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var rec map[string]any
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			continue
		}
		if msg, _ := rec["msg"].(string); strings.Contains(msg, "its badge is left empty") {
			out = append(out, rec)
		}
	}
	return out
}

// An upstream refusal is where owner_keyed decides whether a visitor's own
// exhausted key was spent or ours was, and it was the one gate that omitted it —
// so the question had to be answered by joining request ids back to query
// strings after the fact.
func TestAnUpstreamRefusalSaysWhoseKeyWasUsed(t *testing.T) {
	src := &countingLimiter{name: "mdblist"}
	src.refusing.Store(true)
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{}}
	p.SetHealthTracker(provider.NewHealthTracker(10, 0))

	var buf bytes.Buffer
	p.logger = slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	_, _, _, _, _, _ = p.collectRatingsWithProviders(context.Background(), ratingReq("mdblist"), &provider.MediaMeta{})

	lines := holdOutLines(&buf)
	if len(lines) == 0 {
		t.Fatal("control: no hold-out line was written at all, so the field cannot be checked")
	}
	for _, line := range lines {
		if _, ok := line["owner_keyed"]; !ok {
			t.Errorf("a hold-out at gate %v carries no owner_keyed", line["gate"])
		}
	}
}
