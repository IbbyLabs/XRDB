package compose

import (
	"embed"
	"encoding/json"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Language files name a genre family's label in one language, keyed by family
// id. A file need not be complete: a family it does not name keeps its English
// label, so a partial contribution is still worth having.
//
//go:embed labels/*.json
var embeddedLabels embed.FS

// labelLanguagesDirEnv points at a directory of language files an operator
// supplies. Anyone can add a language without a release, which is the half of
// this that makes contributions possible rather than merely accepted.
const labelLanguagesDirEnv = "XRDB_LABEL_LANGUAGES_DIR"

// familyLabels is built once and swapped by tests, which need to re-read the
// operator's directory after writing into it.
var (
	familyLabelsOnce sync.Once
	familyLabelsMap  map[string]map[string]string
)

func familyLabels() map[string]map[string]string {
	familyLabelsOnce.Do(func() { familyLabelsMap = loadFamilyLabels() })
	return familyLabelsMap
}

// loadFamilyLabels reads the shipped languages and then the operator's, so a
// local file replaces a shipped label rather than being ignored by it.
func loadFamilyLabels() map[string]map[string]string {
	out := map[string]map[string]string{}
	readInto := func(fsys fs.FS, name, lang string) {
		raw, err := fs.ReadFile(fsys, name)
		if err != nil {
			slog.Default().Warn("Could not read a genre label language file", "file", name, "error", err)
			return
		}
		var labels map[string]string
		if err := json.Unmarshal(raw, &labels); err != nil {
			slog.Default().Warn("Ignoring a genre label language file that is not readable JSON",
				"file", name, "error", err)
			return
		}
		if out[lang] == nil {
			out[lang] = map[string]string{}
		}
		for id, label := range labels {
			// A file carries its credit and its gaps as _-prefixed keys, which
			// name no family.
			if strings.HasPrefix(id, "_") || strings.TrimSpace(label) == "" {
				continue
			}
			out[lang][strings.ToLower(id)] = label
		}
	}

	entries, _ := fs.ReadDir(embeddedLabels, "labels")
	for _, e := range entries {
		readInto(embeddedLabels, "labels/"+e.Name(), langOfLabelFile(e.Name()))
	}

	dir := strings.TrimSpace(os.Getenv(labelLanguagesDirEnv))
	if dir == "" {
		return out
	}
	local, err := os.ReadDir(dir)
	if err != nil {
		slog.Default().Warn("Could not read the genre label language directory",
			"variable", labelLanguagesDirEnv, "dir", dir, "error", err)
		return out
	}
	for _, e := range local {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		readInto(os.DirFS(dir), e.Name(), langOfLabelFile(e.Name()))
	}
	return out
}

// langOfLabelFile takes the language from the file name: es.json is Spanish.
func langOfLabelFile(name string) string {
	return strings.ToLower(strings.TrimSuffix(filepath.Base(name), ".json"))
}

// familyLabelIn returns a family's label in the given language, falling back to
// the English one per label rather than per language.
func familyLabelIn(f *genreFamily, lang string) string {
	if f == nil {
		return ""
	}
	lang = strings.ToLower(strings.TrimSpace(lang))
	if lang == "" || lang == "en" {
		return f.label
	}
	byLang := familyLabels()
	if labels, ok := byLang[lang]; ok {
		if v, ok := labels[f.id]; ok {
			return v
		}
	}
	// "pt-br" falls back to "pt" before it falls back to English.
	if base, _, cut := strings.Cut(lang, "-"); cut {
		if labels, ok := byLang[base]; ok {
			if v, ok := labels[f.id]; ok {
				return v
			}
		}
	}
	return f.label
}

// LabelLanguages names the languages genre labels can be drawn in, for the
// admin surface and so a missing contribution is visible rather than silent.
func LabelLanguages() []string {
	out := make([]string, 0, len(familyLabels())+1)
	out = append(out, "en")
	for lang := range familyLabels() {
		out = append(out, lang)
	}
	return out
}
