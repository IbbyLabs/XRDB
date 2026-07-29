package imageconfig

import (
	"reflect"
	"strings"
	"testing"
)

// CacheKey hashes a hand-maintained canonical struct rather than Config itself.
// A field left out of it is invisible to the render cache, so two configs that
// differ only in that field share a cached image and the setting silently does
// nothing. This walks every field and fails on the ones that do not move the
// key.
func TestEveryConfigFieldReachesTheCacheKey(t *testing.T) {
	base := Default()
	baseKey := CacheKey(base)

	var missing []string
	var walk func(v reflect.Value, path string)
	walk = func(v reflect.Value, path string) {
		typ := v.Type()
		for i := 0; i < typ.NumField(); i++ {
			f := typ.Field(i)
			if !f.IsExported() {
				continue
			}
			name := f.Name
			if path != "" {
				name = path + "." + f.Name
			}
			// Grouped sub-configs are embedded in the canonical struct whole, so
			// descend and check their leaves individually.
			if f.Type.Kind() == reflect.Struct && strings.HasSuffix(f.Type.Name(), "Config") {
				walk(v.Field(i), name)
				continue
			}
			mutated := reflect.New(reflect.TypeOf(base)).Elem()
			mutated.Set(reflect.ValueOf(base))
			target := fieldByPath(mutated, name)
			if !target.CanSet() || !mutate(target) {
				continue
			}
			if CacheKey(mutated.Interface().(Config)) == baseKey {
				missing = append(missing, name)
			}
		}
	}
	walk(reflect.ValueOf(base), "")

	if len(missing) > 0 {
		t.Errorf("these config fields do not change the render cache key, so a config that only sets them will be served a stale image: %s",
			strings.Join(missing, ", "))
	}
}

func fieldByPath(v reflect.Value, path string) reflect.Value {
	for _, part := range strings.Split(path, ".") {
		v = v.FieldByName(part)
		if !v.IsValid() {
			return v
		}
	}
	return v
}

// mutate sets a field to a value distinct from the default, reporting false for
// kinds this check cannot vary meaningfully.
func mutate(v reflect.Value) bool {
	switch v.Kind() {
	case reflect.String:
		v.SetString(v.String() + "x")
	case reflect.Bool:
		v.SetBool(!v.Bool())
	case reflect.Int, reflect.Int64:
		v.SetInt(v.Int() + 7)
	case reflect.Float64:
		v.SetFloat(v.Float() + 7)
	case reflect.Slice:
		if v.Type().Elem().Kind() != reflect.String {
			return false
		}
		v.Set(reflect.ValueOf([]string{"xrdb-probe"}))
	case reflect.Map:
		return false
	case reflect.Pointer:
		if v.Type().Elem().Kind() != reflect.Int && v.Type().Elem().Kind() != reflect.Bool {
			return false
		}
		n := reflect.New(v.Type().Elem())
		if n.Elem().Kind() == reflect.Int {
			n.Elem().SetInt(3)
		} else {
			n.Elem().SetBool(true)
		}
		v.Set(n)
	default:
		return false
	}
	return true
}
