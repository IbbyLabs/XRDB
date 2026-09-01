package compose

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A contribution is only worth accepting if it reaches a render, and anyone
// must be able to add one without a release (FR-149).
func TestALanguageFileFromTheOperatorsDirectoryIsUsed(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "es.json"), `{"horror": "TERROR", "comedy": "COMEDIA"}`)
	t.Setenv(labelLanguagesDirEnv, dir)
	resetFamilyLabels(t)

	if got := familyLabelIn(&familyHorror, "es"); got != "TERROR" {
		t.Errorf("es horror = %q, want TERROR", got)
	}
	// The control: a language with no file keeps the built-in label, so this is
	// not "any language string returns something".
	if got := familyLabelIn(&familyHorror, "de"); got != familyHorror.label {
		t.Errorf("de horror = %q, want the built-in %q", got, familyHorror.label)
	}
}

// A contributor who translates some of the labels is still worth having, so the
// fallback is per label rather than per language.
func TestAPartialLanguageFallsBackPerLabel(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "es.json"), `{"horror": "TERROR"}`)
	t.Setenv(labelLanguagesDirEnv, dir)
	resetFamilyLabels(t)

	if got := familyLabelIn(&familyHorror, "es"); got != "TERROR" {
		t.Errorf("translated label = %q, want TERROR", got)
	}
	if got := familyLabelIn(&familyComedy, "es"); got != familyComedy.label {
		t.Errorf("untranslated label = %q, want the built-in %q", got, familyComedy.label)
	}
}

// A regional language takes its base language's file before it gives up.
func TestARegionalLanguageFallsBackToItsBase(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "pt.json"), `{"horror": "TERROR"}`)
	t.Setenv(labelLanguagesDirEnv, dir)
	resetFamilyLabels(t)

	if got := familyLabelIn(&familyHorror, "pt-br"); got != "TERROR" {
		t.Errorf("pt-br horror = %q, want the pt label TERROR", got)
	}
}

// English is a language file like any other, so a contributor can see the
// format and the full set of ids without reading Go.
func TestTheShippedEnglishFileCoversEveryFamily(t *testing.T) {
	resetFamilyLabels(t)
	en, ok := familyLabels()["en"]
	if !ok {
		t.Fatal("no shipped English labels, so a contributor has no template")
	}
	for _, f := range []genreFamily{
		familyAnime, familyAnimation, familyHorror, familyComedy, familyRomance,
		familyAction, familySciFi, familyFantasy, familySciFantasy, familyCrime,
		familyDrama, familyDocumentary, familyMusic, familyReality, familyFamily,
		familyHistory, familyKids, familyNews, familySoap, familyTalk,
		familyTVMovie, familyWarPolitics, familyOther,
	} {
		if en[f.id] != f.label {
			t.Errorf("en.json has %q for %s, the code has %q", en[f.id], f.id, f.label)
		}
	}
}

// A file that is not JSON must not take the process down or silently replace a
// language with nothing.
func TestAnUnreadableLanguageFileIsSkipped(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "es.json"), `not json at all`)
	t.Setenv(labelLanguagesDirEnv, dir)
	resetFamilyLabels(t)

	if got := familyLabelIn(&familyHorror, "es"); got != familyHorror.label {
		t.Errorf("es horror = %q, want the built-in after an unreadable file", got)
	}
}

func write(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// The casing control has one place to live, so a label is stored in its natural
// case and shouted on the way out. Storing it shouting makes "normal" a setting
// that returns the same thing as "upper".
func TestTheCasingControlReachesAFamilyLabel(t *testing.T) {
	upper := applyLabelCase(familyAction.label, "upper", "family")
	normal := applyLabelCase(familyAction.label, "normal", "family")
	unset := applyLabelCase(familyAction.label, "", "family")

	if upper != "ACTION" {
		t.Errorf("upper = %q, want ACTION", upper)
	}
	if normal == upper {
		t.Errorf("normal and upper both give %q; the setting does nothing", normal)
	}
	// Unset keeps the capitals every family label has always drawn in, so no
	// poster changes for anyone who has not set it.
	if unset != "ACTION" {
		t.Errorf("unset = %q, want the capitals it has always drawn", unset)
	}
}

// A contributed file that also carries its credit must not turn that into a
// family nobody can name.
func TestMetadataKeysInALanguageFileAreNotLabels(t *testing.T) {
	resetFamilyLabels(t)
	for lang, labels := range familyLabels() {
		for id := range labels {
			if strings.HasPrefix(id, "_") {
				t.Errorf("%s carries %q as a label", lang, id)
			}
		}
	}
}

// The contribution has to reach a render or accepting it means nothing.
func TestThePortugueseContributionIsLoaded(t *testing.T) {
	resetFamilyLabels(t)
	if got := familyLabelIn(&familyHorror, "pt"); got != "Terror" {
		t.Errorf("pt horror = %q, want Terror", got)
	}
	if got := familyLabelIn(&familyHorror, "pt-br"); got != "Terror" {
		t.Errorf("pt-br horror = %q, want Terror", got)
	}
	// The family added after the contribution keeps its English label rather
	// than leaving a gap.
	if got := familyLabelIn(&familySciFantasy, "pt"); got != familySciFantasy.label {
		t.Errorf("pt scifantasy = %q, want the English %q", got, familySciFantasy.label)
	}
}
