package ui

import (
	"embed"
	"io/fs"
)

// dist is gitignored apart from a tracked .keep, which is what makes this
// pattern match in a clean checkout. Removing it stops this package compiling.
//
//go:embed all:dist
var distFS embed.FS

// FS returns the embedded static file tree rooted at dist/.
func FS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic("ui: failed to sub dist: " + err.Error())
	}
	return sub
}
