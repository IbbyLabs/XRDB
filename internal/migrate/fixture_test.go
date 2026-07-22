package migrate

import (
	"encoding/json"
	"reflect"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// A config built from v2's own default values, so the conversion is exercised
// on real shapes rather than on ones invented to suit it.
func loadV2Fixture(t *testing.T) json.RawMessage {
	t.Helper()
	return json.RawMessage(v2FixtureJSON)
}

func TestWholeV2ConfigConvertsAndStaysReadable(t *testing.T) {
	fixture := loadV2Fixture(t)
	out, stats, err := ConvertConfig(fixture)
	if err != nil {
		t.Fatalf("convert: %v", err)
	}
	t.Logf("converted %d keys", stats.Converted)

	// Every surface has to be readable, or the user lands on defaults.
	var env struct {
		Surfaces map[string]json.RawMessage `json:"surfaces"`
	}
	if err := json.Unmarshal(out, &env); err != nil {
		t.Fatalf("converted config does not parse: %v", err)
	}
	for name, blob := range env.Surfaces {
		if !imageconfig.Accepts(blob) {
			t.Errorf("surface %q is unreadable, so every setting on it is lost: %s", name, blob)
		}
	}

	// And nothing the user had may go missing. Compared by value, since
	// re-encoding compacts whitespace without changing what is stored.
	var before, after map[string]any
	_ = json.Unmarshal(fixture, &before)
	_ = json.Unmarshal(out, &after)
	for key, want := range before {
		got, ok := after[key]
		if !ok {
			t.Errorf("key %q was dropped", key)
			continue
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("key %q changed: %v -> %v", key, want, got)
		}
	}
}

func TestWholeV2ConfigIsIdempotent(t *testing.T) {
	fixture := loadV2Fixture(t)
	once, _, err := ConvertConfig(fixture)
	if err != nil {
		t.Fatalf("convert: %v", err)
	}
	twice, _, err := ConvertConfig(once)
	if err != nil {
		t.Fatalf("reconvert: %v", err)
	}
	if string(once) != string(twice) {
		t.Error("converting a converted config changed it")
	}
}
