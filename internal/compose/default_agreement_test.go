package compose

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
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

	// Every key is compared with the rest of the render turned on. On a bare
	// request three quarters of them draw nothing — no genres, no ring, no
	// badges to place — and an identical render then means "invisible here"
	// rather than "the defaults agree". maximalConfig is the fixture the effect
	// coverage test already keeps current; this reuses it instead of starting a
	// second one that would have to be kept in step by hand.
	rich := flatRequest(maximalConfig())
	rendererDefaults := flatRequest(imageconfig.Default())

	index := map[string][]int{}
	for _, k := range renderConfigKeys() {
		index[k.json] = k.index
	}

	muts := keyMutations()
	richRaw, err := json.Marshal(rich)
	if err != nil {
		t.Fatalf("cannot express the maximal request: %v", err)
	}
	richCfg := imageconfig.Parse(richRaw)

	var blind, checked []string

	for key, uiVal := range uiDefaults {
		uiRaw, err := json.Marshal(uiVal)
		if err != nil {
			continue
		}
		rendererRaw, known := rendererDefaults[key]
		if !known {
			continue // the configurator carries keys the render config does not
		}
		if jsonEquivalent(uiRaw, rendererRaw) {
			continue // the same value cannot render two ways
		}
		// Different text is not yet a different setting: Parse normalises, so
		// "off" and "" arrive as one config. Comparing what Parse produced keeps
		// those out of the render entirely, which leaves an identical render
		// meaning one thing rather than two.
		omittedCfg := imageconfig.Parse(withKey(rich, key, rendererRaw))
		withCfg := imageconfig.Parse(withKey(rich, key, uiRaw))
		if reflect.DeepEqual(flatRequest(omittedCfg), flatRequest(withCfg)) {
			continue
		}
		checked = append(checked, key)

		if drawsDifferently(t, p, omittedCfg, withCfg) {
			if _, ok := sentExplicitly[key]; ok {
				continue // a known disagreement, sent explicitly by buildSrc
			}
			if _, ok := equivalentSentinels[key]; ok {
				continue
			}
			t.Errorf("sending the configurator's default for %q renders differently from omitting it, "+
				"so users lose that setting when the payload drops it", key)
			continue
		}
		{
			// Agreement and invisibility both land here, and a guard that cannot
			// tell them apart reports coverage it does not have. The two values
			// differ, so an identical render means this fixture cannot see the
			// key and nothing here establishes the two defaults interchangeable.
			// Identical renders from differing configs mean one of two things,
			// and a guard that cannot separate them reports coverage it does not
			// have. Move the key to a third value: if the picture changes, this
			// render can see the key, so the two defaults drawing the same thing
			// is evidence they agree. If it does not, nothing was measured.
			ov := muts[key]
			still, probe := richCfg, richCfg
			if ov.pre != nil {
				ov.pre(&still)
				ov.pre(&probe)
			}
			moved := false
			if ov.mut != nil {
				ov.mut(&probe)
				moved = true
			} else if idx, ok := index[key]; ok {
				moved = genericMutate(&probe, idx)
			}
			if moved && drawsDifferently(t, p, still, probe) {
				continue
			}
			// The effect coverage test already names, with a reason, the keys no
			// offline render can exercise. Deferring to it keeps that reason in
			// one place instead of starting a second list beside it.
			if metaOnlyRenderField[key] {
				continue
			}
			if reason, ok := fixtureLimitedField[key]; ok {
				t.Logf("%q: agreement unproven, %s", key, reason)
				continue
			}
			blind = append(blind, key+" (ui "+string(uiRaw)+" vs renderer "+string(rendererRaw)+")")
		}
	}

	sort.Strings(blind)
	if len(blind) > 0 {
		t.Errorf("the two defaults differ for %d key(s) this render cannot see, so their agreement "+
			"is unproven rather than established: %s", len(blind), strings.Join(blind, "\n  "))
	}
	t.Logf("%d of %d configurator defaults differ from the renderer's and were rendered both ways",
		len(checked), len(uiDefaults))

	// An entry left here after the defaults are aligned sends a key nobody
	// needs, and hides the next disagreement behind an exemption.
	for key := range sentExplicitly {
		uiVal, ok := uiDefaults[key]
		if !ok {
			t.Errorf("%q is sent explicitly but the configurator no longer has it", key)
			continue
		}
		uiRaw, _ := json.Marshal(uiVal)
		rendererRaw, ok := rendererDefaults[key]
		if !ok {
			continue
		}
		if !drawsDifferently(t, p,
			imageconfig.Parse(withKey(rich, key, rendererRaw)),
			imageconfig.Parse(withKey(rich, key, uiRaw))) {
			t.Errorf("%q is sent explicitly but the defaults now agree; drop it here and from ALWAYS_SEND", key)
		}
	}
}

// drawsDifferently reports whether two configs draw an unequal picture on any
// surface. A key can be invisible on the poster and plain on the logo, so the
// poster alone would read as agreement. Surfaces are rendered in order and the
// first difference ends the search.
func drawsDifferently(t *testing.T, p *Pipeline, a, b imageconfig.Config) bool {
	t.Helper()
	for _, s := range effectSurfaces {
		x := renderOne(t, p, a, "movie", s)
		y := renderOne(t, p, b, "movie", s)
		if x == nil || y == nil {
			continue
		}
		if !bytes.Equal(x, y) {
			return true
		}
	}
	return false
}

// flatRequest expresses a config in the shape the configurator posts: one flat
// key per render field. Marshalling the struct will not do, since the config
// nests where the request is flat.
func flatRequest(cfg imageconfig.Config) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	v := reflect.ValueOf(cfg)
	for _, k := range renderConfigKeys() {
		raw, err := json.Marshal(v.FieldByIndex(k.index).Interface())
		if err != nil {
			continue
		}
		out[k.json] = raw
	}
	return out
}

func withKey(base map[string]json.RawMessage, key string, val json.RawMessage) json.RawMessage {
	req := make(map[string]json.RawMessage, len(base))
	for k, v := range base {
		req[k] = v
	}
	req[key] = val
	out, _ := json.Marshal(req)
	return out
}

// jsonEquivalent compares two encodings by value, so 1 against 1.0, or a
// differing key order, does not read as a disagreement.
func jsonEquivalent(a, b json.RawMessage) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return bytes.Equal(a, b)
	}
	return reflect.DeepEqual(x, y)
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
	lit = stripLineComments(lit)
	lit = regexp.MustCompile(`'([^']*)'`).ReplaceAllString(lit, `"$1"`)
	lit = regexp.MustCompile(`(?m)^(\s*)([A-Za-z_][A-Za-z0-9_]*):`).ReplaceAllString(lit, `$1"$2":`)
	lit = regexp.MustCompile(`,(\s*[}\]])`).ReplaceAllString(lit, `$1`)

	out := map[string]any{}
	if err := json.Unmarshal([]byte(lit), &out); err != nil {
		t.Fatalf("cannot parse DEFAULT_CONFIG as JSON: %v", err)
	}
	return out
}

// stripLineComments removes // comments and leaves the ones inside string
// literals alone. A default holding a URL is otherwise truncated at its scheme.
func stripLineComments(src string) string {
	var b strings.Builder
	inStr := false
	var quote byte
	for i := 0; i < len(src); i++ {
		c := src[i]
		if inStr {
			if c == '\\' && i+1 < len(src) {
				b.WriteByte(c)
				i++
				b.WriteByte(src[i])
				continue
			}
			if c == quote {
				inStr = false
			}
			b.WriteByte(c)
			continue
		}
		if c == '\'' || c == '"' || c == '`' {
			inStr, quote = true, c
			b.WriteByte(c)
			continue
		}
		if c == '/' && i+1 < len(src) && src[i+1] == '/' {
			for i < len(src) && src[i] != '\n' {
				i++
			}
			b.WriteByte('\n')
			continue
		}
		b.WriteByte(c)
	}
	return b.String()
}
