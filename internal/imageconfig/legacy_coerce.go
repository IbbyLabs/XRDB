package imageconfig

import (
	"encoding/json"
	"reflect"
	"strconv"
	"strings"
)

// v2 kept its entire config as URL query parameters, so every setting reached
// storage as a string: a list arrives comma-separated, a number and a flag
// arrive quoted. Parse reads native JSON types, so a migrated value has to be
// put back into the shape the parser expects or it is silently ignored and the
// profile falls back to a default the user never chose.

// legacyTargets maps a modelled config key to the type Parse reads it into.
// Derived from the raw parse struct for the same reason knownKeys is: it cannot
// drift from the parser it describes.
var legacyTargets = func() map[string]reflect.Type {
	m := make(map[string]reflect.Type)
	var walk func(t reflect.Type)
	walk = func(t reflect.Type) {
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			if f.Anonymous && f.Type.Kind() == reflect.Struct {
				walk(f.Type)
				continue
			}
			name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
			if name == "" || name == "-" {
				continue
			}
			ft := f.Type
			for ft.Kind() == reflect.Pointer {
				ft = ft.Elem()
			}
			m[name] = ft
		}
	}
	walk(reflect.TypeOf(raw{}))
	return m
}()

// CoerceLegacyValue rewrites a v2 value into the JSON shape Parse reads for
// key. It reports false when the key is not modelled, the value is already a
// native JSON type, or the string cannot be read as the target type — in every
// one of those cases the caller should leave the original value alone rather
// than substitute a guess.
func CoerceLegacyValue(key string, value json.RawMessage) (json.RawMessage, bool) {
	target, ok := legacyTargets[key]
	if !ok {
		return nil, false
	}
	var s string
	if err := json.Unmarshal(value, &s); err != nil {
		// Not a quoted string, so it is already in the shape Parse reads.
		return nil, false
	}
	s = strings.TrimSpace(s)

	switch target.Kind() {
	case reflect.Slice:
		if target.Elem().Kind() != reflect.String {
			return nil, false
		}
		items := splitLegacyList(s)
		if len(items) == 0 {
			return nil, false
		}
		encoded, err := json.Marshal(items)
		if err != nil {
			return nil, false
		}
		return encoded, true

	case reflect.Int:
		n, err := strconv.Atoi(s)
		if err != nil {
			return nil, false
		}
		return json.RawMessage(strconv.Itoa(n)), true

	case reflect.Float64:
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return nil, false
		}
		return json.RawMessage(strconv.FormatFloat(f, 'f', -1, 64)), true

	case reflect.Bool:
		b, ok := parseLegacyBool(s)
		if !ok {
			return nil, false
		}
		if b {
			return json.RawMessage("true"), true
		}
		return json.RawMessage("false"), true
	}
	return nil, false
}

// splitLegacyList reads v2's comma-separated list, dropping blanks so a
// trailing comma does not become an empty selection.
func splitLegacyList(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// parseLegacyBool reads the spellings v2 used for a flag.
func parseLegacyBool(s string) (bool, bool) {
	switch strings.ToLower(s) {
	case "true", "1", "yes", "on", "enabled":
		return true, true
	case "false", "0", "no", "off", "disabled", "none":
		return false, true
	}
	return false, false
}
