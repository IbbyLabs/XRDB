package compose

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// The renderer and the configurator keep separate lists of quality badge
// tokens. A token the renderer draws but the configurator does not offer
// cannot be switched off by the person whose poster it appears on, so the two
// lists have to stay in step.
func TestEveryDrawnQualityBadgeHasAConfiguratorChip(t *testing.T) {
	const optionsFile = "../../web/components/configurator-types.ts"

	src, err := os.ReadFile(optionsFile)
	if err != nil {
		t.Skipf("configurator source not available: %v", err)
	}
	block := regexp.MustCompile(`(?s)QUALITY_BADGE_OPTIONS.*?\];`).Find(src)
	if block == nil {
		t.Fatalf("QUALITY_BADGE_OPTIONS not found in %s", optionsFile)
	}
	offered := map[string]bool{}
	for _, m := range regexp.MustCompile(`id:\s*'([^']+)'`).FindAllSubmatch(block, -1) {
		offered[string(m[1])] = true
	}
	if len(offered) == 0 {
		t.Fatal("no ids parsed from QUALITY_BADGE_OPTIONS")
	}

	// qualityBadgeLabel is the renderer's own list: a token it labels is a
	// token it draws.
	for _, token := range []string{
		"4k", "hd", "hdr", "hdr10", "hdr10plus", "dv",
		"dts", "atmos", "imax", "bluray", "remux", "bdremux",
	} {
		if qualityBadgeLabel(token) == "" {
			t.Errorf("renderer no longer draws %q; drop it from this list", token)
			continue
		}
		if !offered[token] {
			t.Errorf("renderer draws %q but the configurator offers no chip for it", token)
		}
	}

	for token := range offered {
		if qualityBadgeLabel(strings.ToLower(token)) == "" {
			t.Errorf("configurator offers %q but the renderer draws nothing for it", token)
		}
	}
}
