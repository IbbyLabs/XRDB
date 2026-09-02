package imageconfig

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

// A two-letter region now steers which country's artwork is preferred, so only a
// region the parser cannot use is dropped. The bare-language case is the
// control: a counter that cannot fire would report "nobody asks" whoever asked.
func TestAConfiguredRegionIsReported(t *testing.T) {
	for _, tc := range []struct {
		name  string
		lang  string
		want  bool
		shows string
	}{
		{name: "a two-letter region is kept", lang: "es-MX", want: false},
		{name: "an underscore is normalised and kept", lang: "pt_BR", want: false},
		{name: "bare language", lang: "es", want: false},
		{name: "en-US keeps its region like any other", lang: "en-US", want: false},
		{name: "a region that is not two letters is dropped", lang: "es-419", want: true, shows: "es-419"},
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
