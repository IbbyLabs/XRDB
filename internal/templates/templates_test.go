package templates

import (
	"encoding/json"
	"testing"
)

func TestAllReturnsSorted(t *testing.T) {
	all := All()
	if len(all) == 0 {
		t.Fatal("expected at least one template")
	}
	for i := 1; i < len(all); i++ {
		a, b := all[i-1], all[i]
		if a.Category > b.Category {
			t.Errorf("not sorted by category: %q > %q", a.Category, b.Category)
		}
		if a.Category == b.Category && a.Name > b.Name {
			t.Errorf("within category %q, %q > %q", a.Category, a.Name, b.Name)
		}
	}
}

func TestAllTemplatesHaveRequiredFields(t *testing.T) {
	for _, tmpl := range All() {
		if tmpl.ID == "" {
			t.Errorf("template missing ID: %+v", tmpl)
		}
		if tmpl.Name == "" {
			t.Errorf("template %q missing Name", tmpl.ID)
		}
		if tmpl.Description == "" {
			t.Errorf("template %q missing Description", tmpl.ID)
		}
		if tmpl.Category == "" {
			t.Errorf("template %q missing Category", tmpl.ID)
		}
		if len(tmpl.Config) == 0 {
			t.Errorf("template %q missing Config", tmpl.ID)
		}
		if !json.Valid(tmpl.Config) {
			t.Errorf("template %q has invalid Config JSON", tmpl.ID)
		}
	}
}

func TestAllTemplateIDsUnique(t *testing.T) {
	seen := make(map[string]bool)
	for _, tmpl := range All() {
		if seen[tmpl.ID] {
			t.Errorf("duplicate template ID %q", tmpl.ID)
		}
		seen[tmpl.ID] = true
	}
}

func TestByIDFound(t *testing.T) {
	tmpl, ok := ByID("minimal")
	if !ok {
		t.Fatal("expected to find template 'minimal'")
	}
	if tmpl.ID != "minimal" {
		t.Errorf("got id %q, want minimal", tmpl.ID)
	}
}

func TestByIDNotFound(t *testing.T) {
	_, ok := ByID("nonexistent-template-id")
	if ok {
		t.Error("expected not found for unknown id")
	}
}

func TestAllDoesNotMutateBuiltins(t *testing.T) {
	first := All()
	// Mutate the config bytes of the first result.
	for i := range first {
		if len(first[i].Config) > 0 {
			first[i].Config[0] = 'X'
		}
	}
	second := All()
	if len(first) != len(second) {
		t.Errorf("All() returned different lengths: %d vs %d", len(first), len(second))
	}
	// If Config was aliased rather than deep-copied, the mutation above would
	// corrupt the builtins slice and second[i].Config[0] would also be 'X'.
	for i, tmpl := range second {
		if len(tmpl.Config) > 0 && tmpl.Config[0] == 'X' {
			t.Errorf("All()[%d] Config is aliased to builtins (mutation leaked)", i)
		}
	}
}
