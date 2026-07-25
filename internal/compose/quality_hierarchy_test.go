package compose

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Selecting every quality badge draws only the highest tier, because each one
// implies the ones below it. Reported as badges going missing, so it is pinned
// here: the behaviour is intended, and the configurator says which picks it
// supersedes.
func TestQualityBadgeHierarchyDropsImpliedTokens(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want []string
	}{
		{
			name: "every badge selected",
			in:   []string{"4k", "hdr", "hdr10", "hdr10plus", "dv", "atmos", "imax"},
			want: []string{"4k", "dv", "atmos", "imax"},
		},
		{"hdr10plus covers hdr10 and hdr", []string{"hdr", "hdr10", "hdr10plus"}, []string{"hdr10plus"}},
		{"hdr10 covers hdr", []string{"hdr", "hdr10"}, []string{"hdr10"}},
		{"hdr alone survives", []string{"4k", "hdr"}, []string{"4k", "hdr"}},
		{"unrelated badges untouched", []string{"4k", "atmos", "imax"}, []string{"4k", "atmos", "imax"}},
		{"case insensitive", []string{"HDR", "DV"}, []string{"DV"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := dedupeQualityTokens(tc.in)
			if strings.Join(got, ",") != strings.Join(tc.want, ",") {
				t.Errorf("dedupeQualityTokens(%v) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

// The configurator mirrors this table so it can mark a pick that will not be
// drawn. Two copies drift, and the UI silently goes back to being wrong, so
// they are compared here.
func TestConfiguratorMirrorsQualityBadgeHierarchy(t *testing.T) {
	path := filepath.Join("..", "..", "web", "components", "configurator-types.ts")
	src, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}

	block := regexp.MustCompile(`(?s)QUALITY_BADGE_IMPLIES[^{]*\{(.*?)\n\};`).FindSubmatch(src)
	if block == nil {
		t.Fatalf("no QUALITY_BADGE_IMPLIES table found in %s", path)
	}
	entry := regexp.MustCompile(`(\w+):\s*\[([^\]]*)\]`)
	ts := map[string][]string{}
	for _, m := range entry.FindAllStringSubmatch(string(block[1]), -1) {
		var implied []string
		for _, raw := range strings.Split(m[2], ",") {
			if v := strings.Trim(strings.TrimSpace(raw), `'"`); v != "" {
				implied = append(implied, v)
			}
		}
		ts[m[1]] = implied
	}

	if len(ts) != len(hdrHierarchy) {
		t.Errorf("configurator lists %d superior badges, renderer has %d", len(ts), len(hdrHierarchy))
	}
	for _, rule := range hdrHierarchy {
		got, ok := ts[rule.superior]
		if !ok {
			t.Errorf("configurator is missing the %q rule", rule.superior)
			continue
		}
		if strings.Join(got, ",") != strings.Join(rule.drops, ",") {
			t.Errorf("%q implies %v in the configurator, %v in the renderer", rule.superior, got, rule.drops)
		}
	}
}
