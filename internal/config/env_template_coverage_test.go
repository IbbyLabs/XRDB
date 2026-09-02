package config

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// envNamePattern matches an XRDB_ name however it is read: os.Getenv, the
// truthy and integer helpers, and credential(), which takes the modern name
// alongside its v2 fallback.
var envNamePattern = regexp.MustCompile(`"(XRDB_[A-Z0-9_]+)"`)

// TestEveryEnvVarIsInTheTemplate fails when the server reads an environment
// variable that env.template never mentions. A self-hoster cannot configure what
// nothing tells them exists, so a knob shipped without a line in the template
// reaches nobody it was built for.
//
// It walks the whole tree rather than one package, because configuration is read
// wherever it is needed: the memory limit and log level live in the admin
// handler, not in this package, and a guard scoped to config.go would have said
// they were fine.
//
// This is the server-config sibling of TestEveryConfigFieldReachesTheCacheKey and
// TestEveryRenderFieldReachesTheConfigurator. Like those it takes no allowlist:
// the way to satisfy it is to document the variable.
func TestEveryEnvVarIsInTheTemplate(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("cannot resolve the repository root: %v", err)
	}
	tmpl, err := os.ReadFile(filepath.Join(root, "env.template"))
	if err != nil {
		t.Fatalf("cannot read env.template: %v", err)
	}
	template := string(tmpl)

	seen := map[string]string{}
	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", "node_modules", "web", "vendor":
				return fs.SkipDir
			}
			return nil
		}
		// Test files configure themselves, not the instance.
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, path)
		for _, m := range envNamePattern.FindAllStringSubmatch(string(src), -1) {
			// A trailing underscore is a prefix the code completes at runtime,
			// such as the per-source TTLs, not a name a reader could set.
			if strings.HasSuffix(m[1], "_") {
				continue
			}
			if _, ok := seen[m[1]]; !ok {
				seen[m[1]] = rel
			}
		}
		return nil
	})
	if walkErr != nil {
		t.Fatalf("cannot walk the repository: %v", walkErr)
	}
	if len(seen) == 0 {
		t.Fatal("found no environment variables at all, so this guard is not looking where it thinks it is")
	}

	var missing []string
	for name, where := range seen {
		// Mentioned anywhere counts: the template names retired v2 spellings in
		// its migration notes, and naming one there still tells the reader it
		// exists.
		if !strings.Contains(template, name) {
			missing = append(missing, name+" ("+where+")")
		}
	}
	sort.Strings(missing)

	if len(missing) > 0 {
		t.Errorf("these environment variables are read by the server but appear nowhere in env.template, so a self-hoster has no way to know they exist — document them in env.template:\n  %s",
			strings.Join(missing, "\n  "))
	}
}

// TestEveryTunableTTLIsNamedInTheTemplate keeps the template's list and
// TTLProviders from drifting. The variables are built by ProviderTTLEnvVar
// rather than written as literals, so the walk above cannot see them, and a
// provider added to the list would otherwise go undocumented.
func TestEveryTunableTTLIsNamedInTheTemplate(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("cannot resolve the repository root: %v", err)
	}
	tmpl, err := os.ReadFile(filepath.Join(root, "env.template"))
	if err != nil {
		t.Fatalf("cannot read env.template: %v", err)
	}
	template := string(tmpl)
	for _, name := range TTLProviders {
		if v := ProviderTTLEnvVar(name); !strings.Contains(template, v) {
			t.Errorf("%s is tunable but %s is not in env.template", name, v)
		}
	}
	for _, name := range TTLSurfaces {
		if v := SurfaceTTLEnvVar(name); !strings.Contains(template, v) {
			t.Errorf("surface %s is tunable but %s is not in env.template", name, v)
		}
	}
}
