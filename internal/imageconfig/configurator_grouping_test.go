package imageconfig

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// A fine-tuning group and the key prefixes that belong in it. The group's own
// gate decides what a user has to switch on before its controls appear, so a
// key whose feature has nothing to do with that gate is unreachable to anyone
// who leaves the gate off.
//
// GenreFine renders inside `{config.genre && (` in configurator-display.tsx, so
// six ratingBadge* controls filed there needed the Genre badge switched on
// before a rating-badge setting could be seen at all. Badge density and badge
// background opacity had never been reachable by anyone who renders without
// genre badges. TestEveryRenderFieldReachesTheConfigurator passed throughout:
// the controls existed, which is a different question from whether they could
// be got to.
var groupOwnsPrefix = map[string][]string{
	"GenreFine":   {"genre"},
	"QualityFine": {"quality"},
}

var funcStart = regexp.MustCompile(`(?m)^(?:export )?function (\w+)`)
var keyUse = regexp.MustCompile(`config\.([A-Za-z0-9_]+)|onUpdate\('([A-Za-z0-9_]+)'`)

// TestFineGroupsOnlyOwnTheirOwnKeys fails when a control lands in a group gated
// on an unrelated feature. Presence and reachability are different properties
// and only the second one is what a user experiences; the coverage guard next
// door asserts the first, and passed for months while six controls sat behind a
// toggle that has nothing to do with them.
func TestFineGroupsOnlyOwnTheirOwnKeys(t *testing.T) {
	// Overridable so the guard can be proved against a known-bad copy without
	// editing the file the repository is using.
	path := os.Getenv("XRDB_CONFIGURATOR_FINE")
	if path == "" {
		path = filepath.Join("..", "..", "web", "components", "configurator-fine.tsx")
	}
	src, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	lines := strings.Split(string(src), "\n")

	// Function name -> line range, so a key can be attributed to the group that
	// renders it rather than to the file.
	type span struct {
		name       string
		start, end int
	}
	var spans []span
	for i, line := range lines {
		if m := funcStart.FindStringSubmatch(line); m != nil {
			if n := len(spans); n > 0 {
				spans[n-1].end = i - 1
			}
			spans = append(spans, span{name: m[1], start: i})
		}
	}
	if n := len(spans); n > 0 {
		spans[n-1].end = len(lines) - 1
	}
	if len(spans) < 5 {
		t.Fatalf("found %d functions in configurator-fine.tsx; the parser is not reading it", len(spans))
	}

	checked := 0
	for _, s := range spans {
		owned, guarded := groupOwnsPrefix[s.name]
		if !guarded {
			continue
		}
		checked++
		var strays []string
		for _, line := range lines[s.start : s.end+1] {
			for _, m := range keyUse.FindAllStringSubmatch(line, -1) {
				key := m[1]
				if key == "" {
					key = m[2]
				}
				if key == "" || !isFeatureKey(key) {
					continue
				}
				if ownsKey(owned, key) {
					continue
				}
				strays = append(strays, key)
			}
		}
		if len(strays) > 0 {
			sort.Strings(strays)
			t.Errorf("%s renders %s, which its gate does not govern; a user who leaves that feature off cannot reach them",
				s.name, strings.Join(unique(strays), ", "))
		}
	}
	if checked != len(groupOwnsPrefix) {
		t.Fatalf("checked %d of %d guarded groups; a rename would silently disable this test",
			checked, len(groupOwnsPrefix))
	}
}

// isFeatureKey reports whether a key names a feature area this guard can judge.
// Keys outside the known prefixes are ignored rather than guessed at.
func isFeatureKey(key string) bool {
	for _, p := range []string{"genre", "quality", "rating"} {
		if strings.HasPrefix(key, p) {
			return true
		}
	}
	return false
}

func ownsKey(prefixes []string, key string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(key, p) {
			return true
		}
	}
	return false
}

func unique(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, v := range in {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}
