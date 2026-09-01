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
		var labels map[string]json.RawMessage
		if err := json.Unmarshal(raw, &labels); err != nil {
			slog.Default().Warn("Ignoring a genre label language file that is not readable JSON",
				"file", name, "error", err)
			return
		}
		if out[lang] == nil {
			out[lang] = map[string]string{}
		}
		for id, entry := range labels {
			// A file carries its credit and its gaps as _-prefixed keys, which
			// name no family.
			if strings.HasPrefix(id, "_") {
				continue
			}
			label, short := decodeLabelEntry(entry)
			if label == "" {
				continue
			}
			key := strings.ToLower(id)
			out[lang][key] = label
			if short != "" {
				out[lang][key+shortSuffix] = short
			}
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

// shortSuffix keys a family's short form beside its label in the same map.
const shortSuffix = "\x00short"

// decodeLabelEntry reads either form a language file may use for a family:
//
//	"horror": "Terror"
//	"scifi":  { "label": "Ficção Científica", "short": "Ficção" }
//
// The full label is the contributor's; the short is what the build draws where
// the label does not fit. Shortening to fit is the build's job and not the
// translator's, which is why both are kept rather than only the one that fits.
func decodeLabelEntry(raw json.RawMessage) (label, short string) {
	var plain string
	if err := json.Unmarshal(raw, &plain); err == nil {
		return strings.TrimSpace(plain), ""
	}
	var pair struct {
		Label string `json:"label"`
		Short string `json:"short"`
	}
	if err := json.Unmarshal(raw, &pair); err != nil {
		return "", ""
	}
	return strings.TrimSpace(pair.Label), strings.TrimSpace(pair.Short)
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
	for _, l := range []string{lang, baseLanguage(lang)} {
		labels, ok := byLang[l]
		if !ok {
			continue
		}
		// The short form is drawn wherever one exists. The genre badge has no
		// fit guard yet, so a long label would widen the plate with nothing to
		// catch it; the contributor's full label is kept in the file and is what
		// a guard will reach for.
		if v, ok := labels[f.id+shortSuffix]; ok {
			return v
		}
		if v, ok := labels[f.id]; ok {
			return v
		}
	}
	return f.label
}

// baseLanguage drops a region: pt-br falls back to pt before it falls back to
// English.
func baseLanguage(lang string) string {
	base, _, _ := strings.Cut(lang, "-")
	return base
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
