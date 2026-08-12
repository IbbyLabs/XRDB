package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// An override replaces the built-in accent for that family only. Without this
// the setting parses and renders nothing, which looks identical to a colour
// nobody happened to notice changing.
func TestAConfiguredFamilyColourReplacesTheBuiltInAccent(t *testing.T) {
	fam := &familySciFantasy
	if got := familyAccent(fam, nil); got != familySciFantasy.accent {
		t.Fatalf("control: with no overrides the accent is %q, want the built-in %q", got, familySciFantasy.accent)
	}
	got := familyAccent(fam, map[string]string{"scifantasy": "#ff0000"})
	if got != "#ff0000" {
		t.Errorf("family accent = %q, want the override #ff0000", got)
	}
}

// Only the named family moves. A map that recoloured everything would pass a
// test that checked one family in isolation.
func TestAnOverrideLeavesOtherFamiliesAlone(t *testing.T) {
	overrides := map[string]string{"scifantasy": "#ff0000"}
	if got := familyAccent(&familyHorror, overrides); got != familyHorror.accent {
		t.Errorf("horror accent = %q, want its built-in %q", got, familyHorror.accent)
	}
}

// Clearing an entry has to remove it rather than write the built-in value, or
// the config pins a colour that stops tracking later changes to the default.
func TestAnAbsentEntryFallsBackToTheDefault(t *testing.T) {
	if got := familyAccent(&familySciFantasy, map[string]string{"horror": "#ff0000"}); got != familySciFantasy.accent {
		t.Errorf("accent = %q, want the built-in %q", got, familySciFantasy.accent)
	}
}

// The genre accent mode reads the same override, so the aggregate accent and
// the badge cannot disagree about what colour a family is.
func TestTheGenreAccentModeUsesTheOverride(t *testing.T) {
	cfg := imageconfig.Config{}
	cfg.AggregateAccentMode = "genre"

	base := aggregateAccentHex(cfg, "critics", []string{"Horror"}, false, 7)
	if base != familyHorror.accent {
		t.Fatalf("control: the genre mode resolved %q, want the built-in %q — the rest of this test would be vacuous", base, familyHorror.accent)
	}

	cfg.GenreFamilyColors = map[string]string{"horror": "#123456"}
	if got := aggregateAccentHex(cfg, "critics", []string{"Horror"}, false, 7); got != "#123456" {
		t.Errorf("the genre accent mode returned %q, want the override #123456", got)
	}
}

// A value that is not a colour is dropped at parse rather than reaching the
// renderer, where it would fail to parse on every render instead of once.
func TestParsingKeepsOnlyColoursAndLowercasesTheFamily(t *testing.T) {
	cfg := imageconfig.Parse([]byte(`{"genreFamilyColors":{"SciFantasy":"#ABCDEF","horror":"not-a-colour"}}`))
	if got := cfg.GenreFamilyColors["scifantasy"]; got != "#ABCDEF" {
		t.Errorf("scifantasy = %q, want #ABCDEF stored under the lowercased key", got)
	}
	if _, ok := cfg.GenreFamilyColors["horror"]; ok {
		t.Error("a non-colour value was kept")
	}
}
