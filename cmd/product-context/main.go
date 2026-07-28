// Command product-context builds the product summary the XRDB community bot
// answers from.
//
// The bot fetches public/product-context.json from the newest tag. Left to be
// written by hand it drifts: the bot goes on describing options that were
// renamed and stays silent about ones that were added. So the prose comes from
// docs/product-context.md and everything checkable is derived here — the render
// options from the config struct itself, the environment variables from the
// table in variables.md.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"time"

	"xrdb_rewrite/internal/imageconfig"
)

const (
	artifactType  = "xrdb-product-context"
	schemaVersion = "1"
	productName   = "XRDB"
	expandedName  = "eXtended Ratings DataBase"
	ownerName     = "IbbyLabs"
	liveURL       = "https://extendedratings.com"
	serverInvite  = "https://discord.gg/wPY2pcqjmm"
)

type section struct {
	Heading string   `json:"heading"`
	Lines   []string `json:"lines"`
}

type artifact struct {
	ArtifactType  string    `json:"artifactType"`
	SchemaVersion string    `json:"schemaVersion"`
	XRDBTag       string    `json:"xrdbTag"`
	GeneratedAt   string    `json:"generatedAt"`
	ProductName   string    `json:"productName"`
	ExpandedName  string    `json:"expandedName"`
	OwnerName     string    `json:"ownerName"`
	LiveURL       string    `json:"liveUrl"`
	ServerInvite  string    `json:"serverInvite"`
	IntroLines    []string  `json:"introLines"`
	Sections      []section `json:"sections"`
}

func main() {
	root := flag.String("root", ".", "repository root")
	version := flag.String("version", "", "release tag to stamp; defaults to the newest git tag")
	out := flag.String("out", "", "output path; defaults to <root>/public/product-context.json")
	stamp := flag.String("generated-at", "", "RFC3339 timestamp; defaults to now")
	flag.Parse()

	if *out == "" {
		*out = filepath.Join(*root, "public", "product-context.json")
	}
	if *version == "" {
		*version = releaseVersion(*root)
	}
	generatedAt := *stamp
	if generatedAt == "" {
		generatedAt = time.Now().UTC().Format(time.RFC3339)
	}

	prose, intro, err := readProse(filepath.Join(*root, "docs", "product-context.md"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "product-context:", err)
		os.Exit(1)
	}

	sections := append(prose, configOptionSection())
	if env := envVarSection(filepath.Join(*root, "variables.md")); env != nil {
		sections = append(sections, *env)
	}

	doc := artifact{
		ArtifactType:  artifactType,
		SchemaVersion: schemaVersion,
		XRDBTag:       *version,
		GeneratedAt:   generatedAt,
		ProductName:   productName,
		ExpandedName:  expandedName,
		OwnerName:     ownerName,
		LiveURL:       liveURL,
		ServerInvite:  serverInvite,
		IntroLines:    intro,
		Sections:      sections,
	}

	doc = keepTimestampIfUnchanged(*out, doc)

	encoded, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, "product-context:", err)
		os.Exit(1)
	}
	encoded = append(encoded, '\n')
	if err := os.MkdirAll(filepath.Dir(*out), 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "product-context:", err)
		os.Exit(1)
	}
	if err := os.WriteFile(*out, encoded, 0o644); err != nil {
		fmt.Fprintln(os.Stderr, "product-context:", err)
		os.Exit(1)
	}
	fmt.Printf("wrote %s (%s, %d sections)\n", *out, *version, len(doc.Sections))
}

// readProse turns the curated markdown into sections. The first section doubles
// as the intro lines, which the bot states before anything else.
func readProse(path string) (sections []section, intro []string, err error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	var current *section
	for _, line := range strings.Split(string(raw), "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "## "):
			if current != nil && len(current.Lines) > 0 {
				sections = append(sections, *current)
			}
			current = &section{Heading: strings.TrimSpace(trimmed[3:])}
		case strings.HasPrefix(trimmed, "- ") && current != nil:
			if item := strings.TrimSpace(trimmed[2:]); item != "" {
				current.Lines = append(current.Lines, item)
			}
		}
	}
	if current != nil && len(current.Lines) > 0 {
		sections = append(sections, *current)
	}
	if len(sections) == 0 {
		return nil, nil, fmt.Errorf("%s has no sections", path)
	}
	return sections, sections[0].Lines, nil
}

// configOptionSection lists every key a render config accepts, read off the
// struct the parser actually uses. An option added without a note here still
// reaches the bot.
func configOptionSection() section {
	keys := jsonKeys(reflect.TypeOf(imageconfig.Config{}), map[reflect.Type]bool{})
	sort.Strings(keys)
	return section{
		Heading: "Config keys the renderer accepts",
		Lines: []string{
			"Generated from the config struct, so this list is what the build accepts rather than what was last written down.",
			"A key not listed here is not read, whatever an older answer or a v2 guide says.",
			strings.Join(keys, ", "),
		},
	}
}

func jsonKeys(t reflect.Type, seen map[reflect.Type]bool) []string {
	if t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct || seen[t] {
		return nil
	}
	seen[t] = true
	var keys []string
	for i := range t.NumField() {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		if field.Anonymous {
			keys = append(keys, jsonKeys(field.Type, seen)...)
			continue
		}
		name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		if name == "" || name == "-" {
			continue
		}
		keys = append(keys, name)
	}
	return keys
}

var envRowRe = regexp.MustCompile("^\\|\\s*`([A-Z0-9_]+)`\\s*\\|\\s*([^|]*?)\\s*\\|")

// envVarSection reads the variable table in variables.md, which is the file the
// operator docs already keep current.
func envVarSection(path string) *section {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var lines []string
	for _, line := range strings.Split(string(raw), "\n") {
		m := envRowRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		name, def := m[1], strings.Trim(m[2], "`")
		if def == "" || def == "unset" {
			lines = append(lines, name+" (unset by default)")
			continue
		}
		lines = append(lines, name+" (default "+def+")")
	}
	if len(lines) == 0 {
		return nil
	}
	return &section{
		Heading: "Server environment variables",
		Lines: append([]string{
			"Read from variables.md, so these are the variables this build reads.",
			"These are set by whoever runs the server, not by a user's config.",
		}, lines...),
	}
}

// releaseVersion reads the version release-please is tracking.
//
// Not the newest git tag: on main that is always the *previous* release, since
// the tag for the release being prepared does not exist yet, which left the
// artifact naming a version behind the one it was published under.
// release-please rewrites this same field in its release PR, so both sides read
// the manifest and agree on the format — a mismatch would have the two
// overwriting each other on every run.
func releaseVersion(root string) string {
	raw, err := os.ReadFile(filepath.Join(root, ".release-please-manifest.json"))
	if err != nil {
		return "untagged"
	}
	var manifest map[string]string
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return "untagged"
	}
	if v := strings.TrimSpace(manifest["."]); v != "" {
		return v
	}
	return "untagged"
}

// keepTimestampIfUnchanged reuses the previous generatedAt when nothing else
// moved. The field changes on every run by definition, so without this the
// artifact differs every time and CI commits a new timestamp on each trigger.
func keepTimestampIfUnchanged(path string, doc artifact) artifact {
	raw, err := os.ReadFile(path)
	if err != nil {
		return doc
	}
	var previous artifact
	if err := json.Unmarshal(raw, &previous); err != nil {
		return doc
	}
	was := doc.GeneratedAt
	doc.GeneratedAt = previous.GeneratedAt
	if reflect.DeepEqual(doc, previous) {
		return doc
	}
	doc.GeneratedAt = was
	return doc
}
