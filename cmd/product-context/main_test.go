package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// The point of deriving the key list is that a new render option reaches the
// bot without anyone remembering to write it down. A reflection walk that
// stopped seeing the embedded groups would still produce a plausible list.
func TestConfigKeysCoverTheEmbeddedGroups(t *testing.T) {
	got := configOptionSection()
	keys := strings.Split(got.Lines[len(got.Lines)-1], ", ")
	index := make(map[string]bool, len(keys))
	for _, k := range keys {
		index[k] = true
	}

	for _, want := range []string{
		"ratings",          // top level
		"badges",           // top level
		"qualityBadgesPos", // QualityBadgeConfig, embedded
		"genreBadgeStyle",  // GenreBadgeConfig, embedded
	} {
		if !index[want] {
			t.Errorf("key %q missing from the derived list", want)
		}
	}
	if len(keys) < 50 {
		t.Errorf("only %d keys derived; the walk is not reaching the struct", len(keys))
	}
}

// Every key the parser reads has to be offered, or the bot will confidently
// deny an option that works.
func TestEveryConfigKeyIsDerived(t *testing.T) {
	got := configOptionSection()
	derived := make(map[string]bool)
	for _, k := range strings.Split(got.Lines[len(got.Lines)-1], ", ") {
		derived[k] = true
	}
	for _, want := range jsonKeys(reflect.TypeOf(imageconfig.Config{}), map[reflect.Type]bool{}) {
		if !derived[want] {
			t.Errorf("config key %q was not carried into the artifact", want)
		}
	}
}

func TestProseParsesHeadingsAndBullets(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "product-context.md")
	if err := os.WriteFile(path, []byte(`# Ignored title

Prose that is not a bullet is ignored.

## First

- one
- two

## Empty section

## Second

- three
`), 0o644); err != nil {
		t.Fatal(err)
	}

	sections, intro, err := readProse(path)
	if err != nil {
		t.Fatalf("readProse: %v", err)
	}
	if len(sections) != 2 {
		t.Fatalf("got %d sections, want 2 (the empty one is dropped)", len(sections))
	}
	if sections[0].Heading != "First" || len(sections[0].Lines) != 2 {
		t.Errorf("first section = %+v", sections[0])
	}
	if sections[1].Heading != "Second" {
		t.Errorf("second heading = %q", sections[1].Heading)
	}
	// The bot states the intro before anything else, so it has to be real prose.
	if !reflect.DeepEqual(intro, []string{"one", "two"}) {
		t.Errorf("intro = %v", intro)
	}
}

func TestProseFailsLoudlyWhenThereIsNothingToSay(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.md")
	if err := os.WriteFile(path, []byte("# Nothing\n\nno bullets here\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := readProse(path); err == nil {
		t.Error("want an error rather than an artifact the bot would reject")
	}
	if _, _, err := readProse(filepath.Join(dir, "absent.md")); err == nil {
		t.Error("want an error for a missing file")
	}
}

func TestEnvVarsAreReadFromTheOperatorDocs(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "variables.md")
	if err := os.WriteFile(path, []byte(
		"| Variable | Default | Notes |\n"+
			"|---|---|---|\n"+
			"| `XRDB_ADDR` | `:3000` | listen address |\n"+
			"| `XRDB_STREAM_ADDON_URL` | unset | stream addon |\n"+
			"not a row\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	got := envVarSection(path)
	if got == nil {
		t.Fatal("no section produced")
	}
	joined := strings.Join(got.Lines, "\n")
	if !strings.Contains(joined, "XRDB_ADDR (default :3000)") {
		t.Errorf("default not carried: %s", joined)
	}
	if !strings.Contains(joined, "XRDB_STREAM_ADDON_URL (unset by default)") {
		t.Errorf("unset default not carried: %s", joined)
	}
}

// A missing variables.md must not take the whole artifact down; the prose and
// the config keys are still worth publishing.
func TestAMissingVariablesFileIsSkipped(t *testing.T) {
	if got := envVarSection(filepath.Join(t.TempDir(), "absent.md")); got != nil {
		t.Errorf("got %+v, want nil", got)
	}
}

// The committed artifact has to keep matching the code it was generated from,
// so a config key added without regenerating fails here rather than reaching
// the bot as a stale list.
func TestTheCommittedArtifactIsCurrent(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "public", "product-context.json"))
	if err != nil {
		t.Skip("no committed artifact to check")
	}
	for _, want := range jsonKeys(reflect.TypeOf(imageconfig.Config{}), map[reflect.Type]bool{}) {
		if !strings.Contains(string(raw), `"`+want+`"`) && !strings.Contains(string(raw), want+",") && !strings.Contains(string(raw), want+`"`) {
			t.Errorf("config key %q is missing from the committed artifact; regenerate it", want)
		}
	}

	// The env-var half of the same artifact. A variable documented in
	// variables.md and absent here is one the bot answers "there is no way to"
	// about. Decoded rather than searched: a name carrying a placeholder is
	// stored with < and > escaped, so a substring search never finds it.
	env := envVarSection(filepath.Join("..", "..", "variables.md"))
	if env == nil {
		t.Fatal("variables.md parsed to nothing, so this checks the artifact against an empty list")
	}
	var art artifact
	if err := json.Unmarshal(raw, &art); err != nil {
		t.Fatalf("cannot decode the committed artifact: %v", err)
	}
	published := map[string]bool{}
	for _, sec := range art.Sections {
		for _, line := range sec.Lines {
			published[line] = true
		}
	}
	for _, want := range env.Lines {
		if !published[want] {
			t.Errorf("environment variable line %q is missing from the committed artifact; regenerate it", want)
		}
	}
}

// Running the generator twice with nothing else changed must not produce a
// diff, or CI commits a fresh timestamp on every trigger.
func TestRegeneratingWithNoChangesKeepsTheTimestamp(t *testing.T) {
	path := filepath.Join(t.TempDir(), "product-context.json")
	base := artifact{
		ArtifactType: artifactType, SchemaVersion: schemaVersion, XRDBTag: "v1.0.0",
		GeneratedAt: "2026-01-01T00:00:00Z", ProductName: productName, ExpandedName: expandedName,
		OwnerName: ownerName, LiveURL: liveURL, ServerInvite: serverInvite,
		IntroLines: []string{"a"}, Sections: []section{{Heading: "H", Lines: []string{"a"}}},
	}
	raw, err := json.MarshalIndent(base, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}

	again := base
	again.GeneratedAt = "2026-06-06T12:00:00Z"
	if got := keepTimestampIfUnchanged(path, again); got.GeneratedAt != base.GeneratedAt {
		t.Errorf("generatedAt = %q, want the previous %q", got.GeneratedAt, base.GeneratedAt)
	}

	changed := base
	changed.GeneratedAt = "2026-06-06T12:00:00Z"
	changed.Sections = []section{{Heading: "H", Lines: []string{"a", "b"}}}
	if got := keepTimestampIfUnchanged(path, changed); got.GeneratedAt != "2026-06-06T12:00:00Z" {
		t.Errorf("generatedAt = %q, want the new one when content moved", got.GeneratedAt)
	}
}

// The version comes from the manifest rather than the newest tag, which on main
// is always the previous release. release-please rewrites this same field in its
// release PR, so the two must agree on the format or they overwrite each other.
func TestTheVersionComesFromTheReleaseManifest(t *testing.T) {
	got := releaseVersion("../..")
	if got == "untagged" {
		t.Skip("no manifest to read")
	}
	if strings.HasPrefix(got, "v") {
		t.Errorf("version = %q, want the bare version release-please writes", got)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", ".release-please-manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest map[string]string
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}
	if got != manifest["."] {
		t.Errorf("version = %q, want the manifest's %q", got, manifest["."])
	}
}

// A checkout without a manifest still produces a usable artifact.
func TestAMissingManifestDoesNotBreakGeneration(t *testing.T) {
	if got := releaseVersion(t.TempDir()); got != "untagged" {
		t.Errorf("got %q, want a placeholder", got)
	}
}

// release-please rewrites $.xrdbTag in the release PR, so the field has to be
// there for its updater to find.
func TestTheArtifactCarriesTheFieldReleasePleaseUpdates(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "public", "product-context.json"))
	if err != nil {
		t.Skip("no committed artifact")
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	if _, ok := doc["xrdbTag"]; !ok {
		t.Error("xrdbTag missing; the release-please extra-files updater would fail")
	}
}
