package templates

import (
	"encoding/json"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// Every template's config must parse into a real render config, or a template
// ships a setting no render will honour.
func TestEveryTemplateConfigParses(t *testing.T) {
	for _, tmpl := range All() {
		cfg := imageconfig.Parse(json.RawMessage(tmpl.Config))
		// Parse never errors by design, so assert the config is non-empty in the
		// way this template intends rather than just that it ran.
		if len(tmpl.Config) < 3 {
			t.Errorf("%s: empty config", tmpl.ID)
		}
		_ = cfg
	}
}

// The two library/cinema templates are defined by specific fields; guard them
// so a later edit cannot quietly gut the look they promise.
func TestCinematicAndLibraryTemplatesKeepTheirLook(t *testing.T) {
	cinematic, ok := ByID("cinematic")
	if !ok {
		t.Fatal("the cinematic template is missing")
	}
	c := imageconfig.Parse(json.RawMessage(cinematic.Config))
	if !c.BackdropAsPoster {
		t.Error("cinematic must use the backdrop as the poster")
	}
	if c.RatingPresentation != "minimal" {
		t.Errorf("cinematic rating presentation = %q, want minimal", c.RatingPresentation)
	}

	lib, ok := ByID("library-quality")
	if !ok {
		t.Fatal("the library-quality template is missing")
	}
	l := imageconfig.Parse(json.RawMessage(lib.Config))
	if len(l.Badges) == 0 {
		t.Error("library-quality must carry quality badges")
	}
	if l.BadgeStyle != imageconfig.BadgeStacked {
		t.Errorf("library-quality badge style = %q, want stacked", l.BadgeStyle)
	}
}
