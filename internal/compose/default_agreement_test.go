package compose

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// The configurator used to name every key it sent, which meant it shouted its
// own default over the renderer's wherever the two disagreed. That list is gone
// (BUG-188): the payload is derived by diffing against DEFAULT_CONFIG, so a key
// holding its default is omitted and the renderer's default applies instead.
//
// That makes the two default sets load-bearing, and this is what checks them.
// Rather than comparing the values — which would need a hand-kept table of
// which mismatches are harmless, i.e. the list we just deleted — it asks the
// only question that matters: does omitting the key change the picture?
//
// A key that fails here is a real behaviour change waiting for a user to find.
// Either align the two defaults, or send it explicitly from buildSrc's
// ALWAYS_SEND and name it below.
var sentExplicitly = map[string]string{
	"size":      "configurator says normal, renderer says small",
	"ageRating": "configurator says off, renderer says on",
	"ratings":   "same two sources, opposite order",
}

// These reach ArtworkOptions, and the stub provider fingerprints every artwork
// option into the URL it returns, so any value at all changes the picture here
// even when the renderer cannot tell the difference. Verified at the draw:
// tmdb.go acts only on "text"/"textless" and only on "requested", so the
// configurator's sentinel and the renderer's empty mean the same thing.
var equivalentSentinels = map[string]string{
	"randomPosterText":     `"any" and "" both mean no preference`,
	"randomPosterLanguage": `"any" and "" both mean no preference`,
	"randomPosterFallback": `"best" and "" both mean the same fallback`,
}

func TestOmittingAConfiguratorDefaultChangesNothing(t *testing.T) {
	uiDefaults := configuratorDefaults(t)
	p := effectPipeline()

	// Baseline: what the renderer draws for a request that carries nothing.
	bare := renderOne(t, p, imageconfig.Default(), "movie", "poster")
	if bare == nil {
		t.Fatal("the bare render produced nothing")
	}

	for key, uiVal := range uiDefaults {
		raw, err := json.Marshal(map[string]any{key: uiVal})
		if err != nil {
			continue
		}
		// Parse the configurator's default for this key on top of nothing else.
		cfg := imageconfig.Parse(raw)
		got := renderOne(t, p, cfg, "movie", "poster")
		if got == nil || bytes.Equal(got, bare) {
			continue // sending it and omitting it agree
		}
		if _, known := sentExplicitly[key]; known {
			continue // a known disagreement, sent explicitly by buildSrc
		}
		if _, harness := equivalentSentinels[key]; harness {
			continue
		}
		t.Errorf("sending the configurator's default for %q renders differently from omitting it, "+
			"so users lose that setting when the payload drops it", key)
	}

	// An entry left here after the defaults are aligned sends a key nobody
	// needs, and hides the next disagreement behind an exemption.
	for key := range sentExplicitly {
		uiVal, ok := uiDefaults[key]
		if !ok {
			t.Errorf("%q is sent explicitly but the configurator no longer has it", key)
			continue
		}
		raw, _ := json.Marshal(map[string]any{key: uiVal})
		if got := renderOne(t, p, imageconfig.Parse(raw), "movie", "poster"); got != nil && bytes.Equal(got, bare) {
			t.Errorf("%q is sent explicitly but the defaults now agree; drop it here and from ALWAYS_SEND", key)
		}
	}
}

// configuratorDefaults reads the DEFAULT_CONFIG literal from the configurator's
// own source. Reading the source rather than a copy is the point: a copy can go
// stale, and staleness is the failure being guarded against.
func configuratorDefaults(t *testing.T) map[string]any {
	t.Helper()
	path := filepath.Join("..", "..", "web", "components", "configurator-types.ts")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("cannot read configurator types at %s: %v", path, err)
	}
	src := string(data)
	start := strings.Index(src, "export const DEFAULT_CONFIG")
	if start < 0 {
		t.Fatal("DEFAULT_CONFIG not found; this guard cannot run")
	}
	open := strings.Index(src[start:], "{") + start
	depth := 0
	end := open
	for i := open; i < len(src); i++ {
		if src[i] == '{' {
			depth++
		} else if src[i] == '}' {
			depth--
			if depth == 0 {
				end = i
				break
			}
		}
	}
	lit := src[open : end+1]
	lit = regexp.MustCompile(`//[^\n]*`).ReplaceAllString(lit, "")
	lit = regexp.MustCompile(`'([^']*)'`).ReplaceAllString(lit, `"$1"`)
	lit = regexp.MustCompile(`(?m)^(\s*)([A-Za-z_][A-Za-z0-9_]*):`).ReplaceAllString(lit, `$1"$2":`)
	lit = regexp.MustCompile(`,(\s*[}\]])`).ReplaceAllString(lit, `$1`)

	out := map[string]any{}
	if err := json.Unmarshal([]byte(lit), &out); err != nil {
		t.Fatalf("cannot parse DEFAULT_CONFIG as JSON: %v", err)
	}
	return out
}
