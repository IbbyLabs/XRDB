package imageconfig

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// TestEveryRenderFieldReachesTheConfigurator fails when the parser accepts a
// config key that has no entry in web/components/configurator-types.ts, so a
// user who reads a feature announcement finds no control for the setting it
// announced. This is the same class of drift as the cache key (see
// TestEveryConfigFieldReachesTheCacheKey), one layer up: the render honoured the
// key, but nobody could reach it.
//
// There is no allowlist. Every key the parser accepts gets a configurator
// control — the guard is never satisfied by exempting a key, however large the
// UI work. To make it pass, wire the control.
func TestEveryRenderFieldReachesTheConfigurator(t *testing.T) {
	path := filepath.Join("..", "..", "web", "components", "configurator-types.ts")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("cannot read configurator types at %s: %v", path, err)
	}
	ui := string(data)

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
			// The configurator declares each key as `name: type` / `name: value`,
			// so the key followed by a colon is the presence signal.
			if !strings.Contains(ui, key+":") {
				missing = append(missing, key)
			}
		}
	}
	walk(reflect.TypeOf(raw{}))

	if len(missing) > 0 {
		t.Errorf("these config keys have no control in web/components/configurator-types.ts, so a user cannot set them in the UI — wire a control (do not exempt them): %s",
			strings.Join(missing, ", "))
	}
}
