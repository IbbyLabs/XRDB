package imageconfig

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

// The configurator carries its own copy of the render defaults. Where the two
// disagree, the configurator's value wins for every profile saved without
// touching that control, so a disagreement is silent.
//
// Both sides are read live: Default() by calling it, DEFAULT_CONFIG by parsing
// the file the browser ships. Neither is a fixture, so neither can drift into
// agreeing with a copy of itself.
const configuratorTypes = "../../web/components/configurator-types.ts"

// Walks the literal line by line rather than matching a window across it: a
// non-greedy regex crossing a record boundary is how the same shape has been
// misread before.
func parseDefaultConfig(t *testing.T, src string) (map[string]any, []string) {
	t.Helper()
	lines := strings.Split(src, "\n")
	start := -1
	for i, l := range lines {
		if strings.HasPrefix(strings.TrimSpace(l), "export const DEFAULT_CONFIG") {
			start = i + 1
			break
		}
	}
	if start < 0 {
		t.Fatal("DEFAULT_CONFIG not found; the parser is reading the wrong file or the shape moved")
	}

	out := map[string]any{}
	var unparsed []string
	for _, raw := range lines[start:] {
		line := strings.TrimSpace(raw)
		if line == "};" || line == "}" {
			break
		}
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			unparsed = append(unparsed, line)
			continue
		}
		key = strings.Trim(strings.TrimSpace(key), "'\"")
		value = strings.TrimSuffix(strings.TrimSpace(value), ",")
		var parsed any
		if err := json.Unmarshal([]byte(strings.ReplaceAll(value, "'", `"`)), &parsed); err != nil {
			// Recorded, never skipped: a value this cannot read must not pass as agreement.
			unparsed = append(unparsed, key)
			continue
		}
		out[key] = parsed
	}
	return out, unparsed
}

func TestConfiguratorDefaultsMatchServerDefaults(t *testing.T) {
	src, err := os.ReadFile(configuratorTypes)
	if err != nil {
		t.Fatalf("reading the configurator defaults: %v", err)
	}
	ts, unparsed := parseDefaultConfig(t, string(src))
	if len(ts) == 0 {
		t.Fatal("parsed no keys; the instrument is blind rather than the file clean")
	}

	blob, err := json.Marshal(Default())
	if err != nil {
		t.Fatalf("marshalling the server defaults: %v", err)
	}
	var server map[string]any
	if err := json.Unmarshal(blob, &server); err != nil {
		t.Fatalf("decoding the server defaults: %v", err)
	}

	// Two keys differ and are not disagreements: the request parser treats these
	// values as "unset" and leaves the server default in place. OutputQuality is
	// guarded by a greater-than-zero test and OutputFormat by a non-empty one,
	// both at config.go:1049-1055. Size is not in this class, because "normal"
	// is a value normalizeMediaSize accepts and so it overrides.
	sentinelUnset := map[string]any{"outputQuality": float64(0), "outputFormat": ""}

	// Keys the two sides are known to disagree on, each waiting on a decision
	// about which value is right. Named here rather than left out, so the test
	// says what it is not checking. Changing either one changes what existing
	// previews render, which is why neither moved with size.
	pending := map[string]string{
		"ageRating": "whether the badge is drawn by default",
		"ratings":   "the order, which is part of the render cache key",
	}

	shared := 0
	for key, want := range server {
		got, ok := ts[key]
		if !ok {
			continue
		}
		shared++
		if sentinel, isSentinel := sentinelUnset[key]; isSentinel && reflect.DeepEqual(got, sentinel) {
			continue
		}
		if reason, isPending := pending[key]; isPending {
			// An exclusion that outlives its disagreement is how a list like this
			// goes stale and starts hiding a real one.
			if reflect.DeepEqual(got, want) {
				t.Errorf("%s now agrees (%v); remove it from pending — it was held for %s", key, got, reason)
			}
			continue
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s: configurator has %v, server default is %v", key, got, want)
		}
	}
	if shared == 0 {
		t.Fatal("no shared keys compared; the two sides are not being lined up")
	}
	t.Logf("compared %d shared keys of %d parsed; %d awaiting a decision; unparsed: %v", shared, len(ts), len(pending), unparsed)
}
