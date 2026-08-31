package imageconfig

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

// The count of configs arriving with a region is what decides whether regional
// artwork selection is worth building. A counter that cannot fire would report
// "nobody asks" no matter who asked, so the bare-language case is the control.
func TestAConfiguredRegionIsReported(t *testing.T) {
	for _, tc := range []struct {
		name  string
		lang  string
		want  bool
		shows string
	}{
		{name: "regional", lang: "es-MX", want: true, shows: "es-mx"},
		{name: "regional with an underscore", lang: "pt_BR", want: true, shows: "pt-br"},
		{name: "bare language", lang: "es", want: false},
		{name: "en-US folds to en and is still a region", lang: "en-US", want: true, shows: "en-us"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			prev := slog.Default()
			slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
			t.Cleanup(func() { slog.SetDefault(prev) })

			raw, err := json.Marshal(map[string]string{"language": tc.lang})
			if err != nil {
				t.Fatalf("marshalling the probe config: %v", err)
			}
			Parse(json.RawMessage(raw))

			got := strings.Contains(buf.String(), "Dropped the region")
			if got != tc.want {
				t.Errorf("language %q: reported=%v, want %v (log: %s)", tc.lang, got, tc.want, buf.String())
			}
			if tc.want && !strings.Contains(buf.String(), tc.shows) {
				t.Errorf("language %q: the line does not carry the requested value %q: %s", tc.lang, tc.shows, buf.String())
			}
		})
	}
}
