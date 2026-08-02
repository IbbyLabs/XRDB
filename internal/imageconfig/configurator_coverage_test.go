package imageconfig

import (
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

// configuratorComponents are the files that render the configurator's controls.
// The type declaration (configurator-types.ts) is deliberately excluded: it
// names every key twice, as a type and a default, so a key present there proves
// only that it was declared, not that a user can set it. The guard reads the
// files that draw controls instead.
var configuratorComponents = []string{
	"configurator-client.tsx",
	"configurator-display.tsx",
	"configurator-fine.tsx",
	"configurator-panels.tsx",
}

// TestEveryRenderFieldReachesTheConfigurator fails when the parser accepts a
// config key that no rendered control references, so a user who reads a feature
// announcement finds no way to set it. This is the same class of drift as the
// cache key (see TestEveryConfigFieldReachesTheCacheKey), one layer up: the
// render honoured the key, but nobody could reach it.
//
// It looks for the key used as a property or a string literal — config.key,
// 'key' or "key" — in a control-rendering component, not merely declared in the
// types file. A key declared but never wired to a control fails here.
//
// There is no allowlist. Every key the parser accepts gets a configurator
// control — the guard is never satisfied by exempting a key, however large the
// UI work. To make it pass, wire the control.
func TestEveryRenderFieldReachesTheConfigurator(t *testing.T) {
	dir := filepath.Join("..", "..", "web", "components")
	var ui strings.Builder
	for _, name := range configuratorComponents {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatalf("cannot read configurator component %s: %v", name, err)
		}
		ui.Write(data)
		ui.WriteByte('\n')
	}
	body := ui.String()

	// A key referenced by a control appears as config.key, 'key' or "key". The
	// trailing non-identifier char keeps a key from being satisfied by a longer
	// key that has it as a prefix — "ratings" must not pass on "ratingsMovie".
	rendered := func(key string) bool {
		re := regexp.MustCompile(`[.'"` + "`" + `]` + regexp.QuoteMeta(key) + `([^A-Za-z0-9_]|$)`)
		return re.MatchString(body)
	}

	var missing []string
	seen := map[string]bool{}
	var walk func(typ reflect.Type)
	walk = func(typ reflect.Type) {
		for i := 0; i < typ.NumField(); i++ {
			f := typ.Field(i)
			if f.Anonymous && f.Type.Kind() == reflect.Struct {
				walk(f.Type)
				continue
			}
			key := strings.Split(f.Tag.Get("json"), ",")[0]
			if key == "" || key == "-" || seen[key] {
				continue
			}
			seen[key] = true
			if !rendered(key) {
				missing = append(missing, key)
			}
		}
	}
	walk(reflect.TypeOf(raw{}))

	if len(missing) > 0 {
		t.Errorf("these config keys are accepted by the parser but no rendered control references them, so a user cannot set them in the UI — wire a control (do not exempt them): %s",
			strings.Join(missing, ", "))
	}
}
