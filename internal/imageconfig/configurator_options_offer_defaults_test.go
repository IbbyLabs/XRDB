package imageconfig

import (
	"fmt"
	"os"
	"strings"
	"testing"
)

// Each control the configurator renders holds a value from DEFAULT_CONFIG and
// offers an option list beside it. A default the list does not carry paints as
// the first option instead of the value the profile holds, and once the control
// is touched the default is unreachable.
var optionListForDefault = map[string]string{
	"size":           "SIZE_OPTIONS",
	"outputFormat":   "OUTPUT_FORMAT_OPTIONS",
	"artworkSource":  "ARTWORK_OPTIONS",
	"textPreference": "TEXT_PREF_OPTIONS",
}

// Reads the ids out of one `export const NAME = [...] as const;` literal, a line
// at a time for the reason parseDefaultConfig does: a regex spanning records
// misreads this shape.
func parseOptionIDs(t *testing.T, src, name string) []string {
	t.Helper()
	lines := strings.Split(src, "\n")
	start := -1
	for i, l := range lines {
		if strings.HasPrefix(strings.TrimSpace(l), "export const "+name+" ") {
			start = i + 1
			break
		}
	}
	if start < 0 {
		t.Fatalf("%s not found in %s; the parser is reading the wrong file or the shape moved", name, configuratorTypes)
	}
	var ids []string
	for _, raw := range lines[start:] {
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "]") {
			break
		}
		_, rest, ok := strings.Cut(line, "id:")
		if !ok {
			continue
		}
		rest = strings.TrimSpace(rest)
		if len(rest) == 0 || rest[0] != '\'' {
			continue
		}
		rest = rest[1:]
		end := strings.IndexByte(rest, '\'')
		if end < 0 {
			continue
		}
		ids = append(ids, rest[:end])
	}
	return ids
}

func TestConfiguratorOptionListsOfferTheirDefault(t *testing.T) {
	src, err := os.ReadFile(configuratorTypes)
	if err != nil {
		t.Fatalf("reading the configurator defaults: %v", err)
	}
	defaults, _ := parseDefaultConfig(t, string(src))
	if len(defaults) == 0 {
		t.Fatal("parsed no keys; the instrument is blind rather than the file clean")
	}

	checked := 0
	for key, list := range optionListForDefault {
		want, ok := defaults[key]
		if !ok {
			t.Errorf("%s is not a DEFAULT_CONFIG key; this pairing no longer names a real control", key)
			continue
		}
		ids := parseOptionIDs(t, string(src), list)
		if len(ids) == 0 {
			t.Fatalf("%s parsed as empty; a list with no ids cannot fail this test", list)
		}
		checked++
		found := false
		for _, id := range ids {
			if id == fmt.Sprint(want) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("DEFAULT_CONFIG.%s is %q, which %s does not offer: %v", key, want, list, ids)
		}
	}
	if checked != len(optionListForDefault) {
		t.Fatalf("checked %d of %d pairings", checked, len(optionListForDefault))
	}
}
