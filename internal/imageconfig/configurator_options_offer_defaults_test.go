package imageconfig

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"
)

// The controls the browser renders, read from the files it ships rather than
// listed here. A pairing that is declared instead of derived guards the controls
// someone remembered, and a control added later is indistinguishable from a
// guarded one.
var configuratorViews = []string{
	"../../web/components/configurator-display.tsx",
	"../../web/components/configurator-panels.tsx",
}

var (
	boundKey       = regexp.MustCompile(`value=\{config\.([A-Za-z0-9_]+)\}`)
	literalOption  = regexp.MustCompile(`<option value="([^"]*)"`)
	constReference = regexp.MustCompile(`\b([A-Z][A-Z0-9_]{2,})\b`)
)

// Reads the ids out of one `export const NAME = [...]` literal, a line at a time
// for the reason parseDefaultConfig does: a regex spanning records misreads this
// shape. Returns nil when the name is not an option list.
func parseOptionIDs(src, name string) []string {
	lines := strings.Split(src, "\n")
	prefix := "export const " + name
	start := -1
	for i, l := range lines {
		t := strings.TrimSpace(l)
		if strings.HasPrefix(t, prefix) && len(t) > len(prefix) && strings.ContainsRune(" :=", rune(t[len(prefix)])) {
			start = i + 1
			break
		}
	}
	if start < 0 {
		return nil
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
		if end := strings.IndexByte(rest, '\''); end >= 0 {
			ids = append(ids, rest[:end])
		}
	}
	return ids
}

// Every value a select offers: its literal options plus the ids of any option
// list it names. A list narrowed by .filter is not modelled, so a filter that
// removed the default would pass here.
func offeredValues(block, types string) map[string]bool {
	out := map[string]bool{}
	for _, m := range literalOption.FindAllStringSubmatch(block, -1) {
		out[m[1]] = true
	}
	for _, m := range constReference.FindAllStringSubmatch(block, -1) {
		for _, id := range parseOptionIDs(types, m[1]) {
			out[id] = true
		}
	}
	return out
}

func TestConfiguratorControlsOfferTheirDefault(t *testing.T) {
	types, err := os.ReadFile(configuratorTypes)
	if err != nil {
		t.Fatalf("reading the configurator defaults: %v", err)
	}
	defaults, _ := parseDefaultConfig(t, string(types))
	if len(defaults) == 0 {
		t.Fatal("parsed no keys; the instrument is blind rather than the file clean")
	}

	checked := 0
	for _, path := range configuratorViews {
		src, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("reading %s: %v", path, err)
		}
		blocks := strings.Split(string(src), "<select")
		if len(blocks) < 2 {
			t.Fatalf("%s has no select controls; the parser is reading the wrong file or the shape moved", path)
		}
		for _, block := range blocks[1:] {
			block, _, _ = strings.Cut(block, "</select>")
			key := boundKey.FindStringSubmatch(block)
			if key == nil {
				continue
			}
			want, ok := defaults[key[1]]
			if !ok {
				t.Errorf("%s: control bound to config.%s, which DEFAULT_CONFIG does not carry", path, key[1])
				continue
			}
			offered := offeredValues(block, string(types))
			if len(offered) == 0 {
				t.Errorf("%s: found no values for config.%s; the control builds its options in a shape this cannot read, so it is unguarded", path, key[1])
				continue
			}
			checked++
			if !offered[fmt.Sprint(want)] {
				t.Errorf("%s: DEFAULT_CONFIG.%s is %q, which its control does not offer", path, key[1], want)
			}
		}
	}
	if checked == 0 {
		t.Fatal("no controls compared; the two sides are not being lined up")
	}
	t.Logf("checked %d controls against their own option lists", checked)
}
