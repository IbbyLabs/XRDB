package provider

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// declaredRatingSources reads every RatingSources method in this package and
// returns the sources each provider declares.
//
// Read from the source rather than kept in a list here: a hand-written list
// goes stale the day a provider is added, and a stale list makes this guard
// pass while the thing it guards is broken. The registry itself is assembled in
// cmd/api, which a package test cannot import.
func declaredRatingSources(t *testing.T) map[string][]string {
	t.Helper()
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("reading the provider package: %v", err)
	}
	fset := token.NewFileSet()
	var files []*ast.File
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, name, nil, 0)
		if err != nil {
			t.Fatalf("parsing %s: %v", name, err)
		}
		files = append(files, file)
	}

	out := make(map[string][]string)
	{
		for _, file := range files {
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if !ok || fn.Name.Name != "RatingSources" || fn.Recv == nil {
					continue
				}
				receiver := receiverName(fn)
				var sources []string
				ast.Inspect(fn, func(n ast.Node) bool {
					lit, ok := n.(*ast.BasicLit)
					if ok && lit.Kind == token.STRING {
						if s, err := strconv.Unquote(lit.Value); err == nil && s != "" {
							sources = append(sources, s)
						}
					}
					return true
				})
				switch {
				case len(sources) > 0:
					out[receiver] = sources
				case forwardsRatingSources(fn), declaresNoSources(fn):
					// A wrapper delegating to the provider it wraps adds no
					// source of its own, and a provider returning nil supplies
					// none. Both are readable answers rather than silence.
				default:
					// Contributing nothing is how a guard goes blind: the type
					// declares sources this cannot read, and every overlap it
					// takes part in disappears from the check without a word.
					t.Errorf("%s.RatingSources is neither a list of literals nor a forward, so its sources are invisible here", receiver)
				}
			}
		}
	}
	if len(out) < 5 {
		t.Fatalf("found %d providers declaring rating sources, which is too few to be reading the package", len(out))
	}
	return out
}

// declaresNoSources reports whether the method plainly returns nothing.
func declaresNoSources(fn *ast.FuncDecl) bool {
	returns := 0
	nils := 0
	ast.Inspect(fn, func(n ast.Node) bool {
		ret, ok := n.(*ast.ReturnStmt)
		if !ok {
			return true
		}
		returns++
		if len(ret.Results) == 1 {
			if id, ok := ret.Results[0].(*ast.Ident); ok && id.Name == "nil" {
				nils++
			}
		}
		return true
	})
	return returns > 0 && returns == nils
}

// forwardsRatingSources reports whether the method delegates to another
// provider's RatingSources rather than declaring any itself.
func forwardsRatingSources(fn *ast.FuncDecl) bool {
	found := false
	ast.Inspect(fn, func(n ast.Node) bool {
		sel, ok := n.(*ast.SelectorExpr)
		if ok && sel.Sel != nil && sel.Sel.Name == "RatingSources" {
			found = true
		}
		return !found
	})
	return found
}

func receiverName(fn *ast.FuncDecl) string {
	if len(fn.Recv.List) == 0 {
		return ""
	}
	switch typ := fn.Recv.List[0].Type.(type) {
	case *ast.StarExpr:
		if id, ok := typ.X.(*ast.Ident); ok {
			return id.Name
		}
	case *ast.Ident:
		return typ.Name
	}
	return ""
}

// A source supplied by two providers that declare the same number of sources
// has no derived winner, and falling back to the sorted provider list is the
// bug this preference exists to remove. Adding such a provider must break here
// with the pair named, not choose quietly.
func TestEverySharedSourceHasAnUnambiguousPreferredSupplier(t *testing.T) {
	declared := declaredRatingSources(t)

	suppliers := make(map[string][]Supplier)
	for receiver, sources := range declared {
		for _, s := range sources {
			suppliers[s] = append(suppliers[s], Supplier{Name: receiver, Declares: len(sources)})
		}
	}

	var unresolved []string
	for source, offers := range suppliers {
		if len(offers) < 2 {
			continue
		}
		if _, pinned := explicitSupplierOrder[source]; pinned {
			continue
		}
		ranked := RankSuppliers(source, offers)
		if ranked[0].Declares == ranked[1].Declares {
			unresolved = append(unresolved,
				source+": "+ranked[0].Name+" and "+ranked[1].Name+" both declare "+
					strconv.Itoa(ranked[0].Declares))
		}
	}
	sort.Strings(unresolved)
	for _, u := range unresolved {
		t.Errorf("no preferred supplier for %s; add an entry to explicitSupplierOrder", u)
	}
}

// The pinned order must name providers that exist and supply the source, or it
// silently stops applying.
func TestTheExplicitOrderNamesRealSuppliers(t *testing.T) {
	declared := declaredRatingSources(t)

	// Provider type names differ from the registered names the order is written
	// in, so match on what each type declares instead.
	for source, order := range explicitSupplierOrder {
		count := 0
		for _, sources := range declared {
			for _, s := range sources {
				if s == source {
					count++
				}
			}
		}
		if count < 2 {
			t.Errorf("%s is pinned in explicitSupplierOrder but has %d supplier(s)", source, count)
		}
		if len(order) < count {
			t.Errorf("%s has %d suppliers but the pinned order lists %d", source, count, len(order))
		}
	}
}
