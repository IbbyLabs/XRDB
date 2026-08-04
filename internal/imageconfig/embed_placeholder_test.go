package imageconfig

import (
	"os"
	"path/filepath"
	"testing"
)

// internal/ui/dist holds the built web UI, which is gitignored except for a
// single tracked placeholder. `//go:embed all:dist` in internal/ui needs the
// directory to exist in a fresh checkout, so losing the placeholder stops the
// whole binary compiling.
//
// This lives here rather than in internal/ui because that package is the one
// that fails to build when the placeholder is missing, so a test inside it
// could not run to report the problem.
//
// The trap is that a local tree usually has a real build in dist, so the embed
// resolves and everything passes right up until CI checks out clean. A build
// step that clears dist takes the placeholder with it, and `git add -A` stages
// the deletion.
func TestEmbedPlaceholderStillExists(t *testing.T) {
	path := filepath.Join("..", "ui", "dist", ".keep")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("internal/ui/dist/.keep is missing (%v).\n"+
			"It is the only tracked file under dist/ and go:embed all:dist needs the\n"+
			"directory present in a clean checkout. Restore it before committing:\n"+
			"  git checkout -- internal/ui/dist/.keep", err)
	}
}
