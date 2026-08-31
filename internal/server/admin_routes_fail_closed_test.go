package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
)

var adminRoutePattern = regexp.MustCompile(`mux\.HandleFunc\("(/api/admin/[^"]+)"`)

// The paths come from the source rather than from a list here. Four routes
// answered unauthenticated with no key for weeks, and a declared list guards
// the routes someone remembered: a route added later is indistinguishable from
// a guarded one from the test's side.
func adminRoutePaths(t *testing.T) []string {
	t.Helper()
	entries, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("globbing the package: %v", err)
	}
	seen := map[string]bool{}
	for _, f := range entries {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("reading %s: %v", f, err)
		}
		for _, m := range adminRoutePattern.FindAllStringSubmatch(string(src), -1) {
			seen[m[1]] = true
		}
	}
	var out []string
	for p := range seen {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

func TestAdminRoutesFailClosedWithoutAKey(t *testing.T) {
	paths := adminRoutePaths(t)
	if len(paths) < 5 {
		t.Fatalf("found %d admin routes; the parser is reading the wrong files rather than the surface being small", len(paths))
	}

	mux := http.NewServeMux()
	cfg := config.Config{}
	registerAdminRoutes(mux, nil, cfg, nil, nil, nil, nil)
	registerFolderWriterRoutes(mux, cfg, nil, nil)

	checked := 0
	for _, path := range paths {
		// A route that only accepts POST answers 405 to a GET, and a 405 means
		// the auth check never ran. Probing one method would let a POST-only
		// route pass without its guard ever being reached.
		probed := 0
		for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
			if rec.Code == http.StatusMethodNotAllowed {
				continue
			}
			probed++

			if rec.Code != http.StatusUnauthorized {
				t.Errorf("%s %s answered %d without an admin key, want 401", method, path, rec.Code)
			}
		}
		if probed == 0 {
			t.Errorf("%s rejected every method as 405, so nothing about its guard was tested", path)
			continue
		}
		checked++
	}
	if checked != len(paths) {
		t.Fatalf("checked %d of %d routes", checked, len(paths))
	}
	t.Logf("checked %d admin routes, every one refusing without a key", checked)
}
