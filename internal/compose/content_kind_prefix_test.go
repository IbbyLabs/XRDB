package compose

import (
	"context"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// The kind is spelled at the front of the id AIOMetadata sends, and only
// resolveContentKind is asked for it. Reading a tmdb: prefix alone left
// "series:tmdb:330176" with no kind, so a per-type override was ignored for the
// most common TMDB shape in production.
func TestTheKindIsReadFromTheFrontOfTheID(t *testing.T) {
	p := &Pipeline{}
	for _, tc := range []struct {
		id   string
		want string
	}{
		{"series:tmdb:330176", "series"},
		{"tv:tmdb:330176", "series"},
		{"movie:tmdb:1726", "movie"},
		{"series:tt0903747", "series"},
		{"movie:tt0468569", "movie"},
		{"tmdb:series:330176", "series"},
		{"tmdb:movie:1726", "movie"},
		{"tt0903747:1:1", "series"},
		// A bare TMDB id names no kind; the fix must not invent one.
		{"tmdb:1726", ""},
		{"tt0468569", ""},
	} {
		t.Run(tc.id, func(t *testing.T) {
			if got := p.resolveContentKind(context.Background(), Request{MediaID: tc.id}); got != tc.want {
				t.Errorf("resolveContentKind(%q) = %q, want %q", tc.id, got, tc.want)
			}
		})
	}
}

// Four places strip a leading content-type token, each for its own reason and
// with its own handling of what it strips. The list itself is the shared thing,
// and a site that gains a token the others lack is how one shape stops being
// recognised in exactly one place. Derived from source so a divergence fails
// here rather than in a render.
func TestEverySiteStripsTheSameContentTypeTokens(t *testing.T) {
	files := []string{
		"compose.go",
		"../provider/tmdb.go",
		"../provider/trending.go",
		"../provider/animemap/animemap.go",
	}

	var want []string
	for _, rel := range files {
		path := filepath.Clean(rel)
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("%s: %v", rel, err)
		}
		fset := token.NewFileSet()
		f, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			t.Fatalf("parsing %s: %v", rel, err)
		}

		found := false
		ast.Inspect(f, func(n ast.Node) bool {
			lit, ok := n.(*ast.CompositeLit)
			if !ok {
				return true
			}
			arr, ok := lit.Type.(*ast.ArrayType)
			if !ok {
				return true
			}
			if id, ok := arr.Elt.(*ast.Ident); !ok || id.Name != "string" {
				return true
			}
			var toks []string
			for _, e := range lit.Elts {
				bl, ok := e.(*ast.BasicLit)
				if !ok || bl.Kind != token.STRING {
					return true
				}
				toks = append(toks, strings.Trim(bl.Value, `"`))
			}
			if len(toks) == 0 || !strings.HasSuffix(toks[0], ":") {
				return true
			}
			sort.Strings(toks)
			if want == nil {
				want = toks
			} else if strings.Join(toks, ",") != strings.Join(want, ",") {
				t.Errorf("%s strips %v, the others strip %v", rel, toks, want)
			}
			found = true
			return false
		})
		if !found {
			t.Errorf("%s no longer contains a content-type token list; the guard is blind", rel)
		}
	}
	if len(want) == 0 {
		t.Fatal("no token list parsed from any file")
	}
	t.Logf("all four sites strip %v", want)
}
