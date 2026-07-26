package imageconfig

import (
	"os"
	"regexp"
	"testing"
)

// The renderer alias-maps badge tokens on every draw but never writes the
// result back, so the configurator has to fold the same aliases when it loads a
// config. If it does not, a stored "UHD" draws a 4K badge with no chip to
// switch it off. Two hand-maintained tables, so they need a guard.
func TestBadgeAliasesMatchTheConfigurator(t *testing.T) {
	const src = "../../web/components/configurator-types.ts"

	data, err := os.ReadFile(src)
	if err != nil {
		t.Skipf("configurator source not available: %v", err)
	}
	block := regexp.MustCompile(`(?s)QUALITY_BADGE_ALIASES.*?\};`).Find(data)
	if block == nil {
		t.Fatalf("QUALITY_BADGE_ALIASES not found in %s", src)
	}

	web := map[string]string{}
	for _, m := range regexp.MustCompile(`'([^']+)':\s*'([^']+)'`).FindAllSubmatch(block, -1) {
		web[string(m[1])] = string(m[2])
	}
	if len(web) == 0 {
		t.Fatal("no aliases parsed from QUALITY_BADGE_ALIASES")
	}

	for from, to := range qualityBadgeAliases {
		got, ok := web[from]
		if !ok {
			t.Errorf("renderer maps %q to %q but the configurator does not fold it", from, to)
			continue
		}
		if got != to {
			t.Errorf("alias %q: renderer maps to %q, configurator to %q", from, to, got)
		}
	}
	for from, to := range web {
		if _, ok := qualityBadgeAliases[from]; !ok {
			t.Errorf("configurator folds %q to %q but the renderer does not", from, to)
		}
	}
}
