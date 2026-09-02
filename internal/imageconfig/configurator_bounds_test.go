package imageconfig

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// A field's bounds are written twice: clampInt in the parser and min/max on the
// configurator's NumField. Nothing holds the two together, so a control can
// offer a value the server refuses and the user's setting does not survive.
//
// The server's accepted set is the clamp range plus 0 wherever the parser guards
// on the value being non-zero, which is a third of the clamped fields. The UI's
// offered set is min and max plus 0 wherever zeroIsDefault leaves the box
// clearable. Comparing the ranges alone reports thirty fields that are correct.
//
// Only one direction is asserted. A control narrower than the server is a design
// choice — the opacity sliders stop at 5 because 1 to 4 percent is invisible —
// and a rule against it would be red on arrival for reasons nobody wants changed.

type numFieldBounds struct {
	min, max      int
	zeroClearable bool
}

type clampBounds struct {
	lo, hi  int
	guarded bool
}

var (
	numFieldRe  = regexp.MustCompile(`(?s)<NumField\b(.*?)/>`)
	onUpdateRe  = regexp.MustCompile(`onUpdate\(\s*'([A-Za-z0-9_]+)'`)
	configRefRe = regexp.MustCompile(`config\.([A-Za-z0-9_]+)`)
	zeroFlagRe  = regexp.MustCompile(`zeroIsDefault=\{(true|false)\}`)
	minRe       = regexp.MustCompile(`min=\{(-?\d+)\}`)
	maxRe       = regexp.MustCompile(`max=\{(-?\d+)\}`)
	clampRe     = regexp.MustCompile(`clampInt\(\*r\.([A-Za-z0-9_]+),\s*(-?\d+),\s*(-?\d+)\)`)
)

func configuratorNumFields(t *testing.T) map[string]numFieldBounds {
	t.Helper()
	dir := filepath.Join("..", "..", "web", "components")
	var body strings.Builder
	for _, name := range configuratorComponents {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatalf("cannot read configurator component %s: %v", name, err)
		}
		body.Write(data)
		body.WriteByte('\n')
	}

	out := map[string]numFieldBounds{}
	for _, m := range numFieldRe.FindAllStringSubmatch(body.String(), -1) {
		el := m[1]
		// A NumField writing a map entry names no config field and is not a
		// bound on one.
		var field string
		if f := onUpdateRe.FindStringSubmatch(el); f != nil {
			field = f[1]
		} else if f := configRefRe.FindStringSubmatch(el); f != nil {
			field = f[1]
		} else {
			continue
		}
		lo, hi := minRe.FindStringSubmatch(el), maxRe.FindStringSubmatch(el)
		if lo == nil || hi == nil {
			continue
		}
		low, _ := strconv.Atoi(lo[1])
		high, _ := strconv.Atoi(hi[1])
		// zeroIsDefault defaults to true on the component, so an element that
		// does not name it leaves the box clearable.
		clearable := true
		if z := zeroFlagRe.FindStringSubmatch(el); z != nil {
			clearable = z[1] == "true"
		}
		out[field] = numFieldBounds{min: low, max: high, zeroClearable: clearable}
	}
	return out
}

func parserClamps(t *testing.T) map[string]clampBounds {
	t.Helper()
	data, err := os.ReadFile("config.go")
	if err != nil {
		t.Fatalf("cannot read config.go: %v", err)
	}
	lines := strings.Split(string(data), "\n")
	out := map[string]clampBounds{}
	for i, line := range lines {
		m := clampRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		field := m[1]
		lo, _ := strconv.Atoi(m[2])
		hi, _ := strconv.Atoi(m[3])
		// Both spellings of the sentinel guard. Reading only one reports the
		// fields written the other way as violations.
		guard := regexp.MustCompile(`\*r\.` + regexp.QuoteMeta(field) + `\s*(!=\s*0|>\s*0)`)
		window := strings.Join(lines[max(0, i-3):i+1], "\n")
		out[field] = clampBounds{lo: lo, hi: hi, guarded: guard.MatchString(window)}
	}
	return out
}

func TestTheConfiguratorNeverOffersWhatTheParserRefuses(t *testing.T) {
	ui := configuratorNumFields(t)
	clamps := parserClamps(t)

	compared := 0
	for field, bounds := range ui {
		clamp, ok := clamps[strings.ToUpper(field[:1])+field[1:]]
		if !ok {
			continue
		}
		compared++
		offered := []int{bounds.min, bounds.max}
		if bounds.zeroClearable {
			offered = append(offered, 0)
		}
		seen := map[int]bool{}
		var refused []int
		for _, v := range offered {
			if seen[v] || (v == 0 && clamp.guarded) {
				continue
			}
			if v < clamp.lo || v > clamp.hi {
				seen[v] = true
				refused = append(refused, v)
			}
		}
		if len(refused) > 0 {
			sort.Ints(refused)
			t.Errorf("%s: the control offers %v, which the parser clamps to %d..%d (sentinel guard: %v)",
				field, refused, clamp.lo, clamp.hi, clamp.guarded)
		}
	}

	// Both sides are read by regex, and a rename on either would leave this
	// green having compared nothing.
	if compared < 40 {
		t.Fatalf("compared %d fields; the extraction has stopped matching", compared)
	}
}
