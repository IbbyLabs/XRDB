package compose

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
	"testing"
)

// A monitor told a hold-out from a remembered answer by which fields were
// present — gate without age_ms. Adding an elapsed time to the hold-out line
// would have broken it silently, with the monitor still reporting. Every one of
// these lines now says what happened, so a reader keys on a value that exists.
func TestEverySourceOutcomeLineSaysWhatHappened(t *testing.T) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "compose.go", nil, 0)
	if err != nil {
		t.Fatalf("parsing compose.go: %v", err)
	}

	// The messages a monitor reads. Each must carry an outcome.
	wantOutcome := map[string]bool{
		"A ratings source is held out; serving a remembered rating":        false,
		"A ratings source is degraded; serving its last known good result": false,
	}

	ast.Inspect(f, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok || len(call.Args) < 2 {
			return true
		}
		msg, ok := call.Args[1].(*ast.BasicLit)
		if !ok || msg.Kind != token.STRING {
			return true
		}
		text := strings.Trim(msg.Value, `"`)
		if _, watched := wantOutcome[text]; !watched {
			return true
		}
		for _, a := range call.Args {
			if lit, ok := a.(*ast.BasicLit); ok && strings.Trim(lit.Value, `"`) == "outcome" {
				wantOutcome[text] = true
			}
		}
		return true
	})

	for msg, found := range wantOutcome {
		if !found {
			t.Errorf("no outcome field on %q; a reader has to key on the shape instead", msg)
		}
	}
}

// The two values are the contract. A reader matching "held_out" must not be
// silently broken by a rename.
func TestTheOutcomeValuesAreStable(t *testing.T) {
	if outcomeHeldOut != "held_out" {
		t.Errorf("held-out outcome is %q; monitors match held_out", outcomeHeldOut)
	}
	if outcomeRemembered != "remembered" {
		t.Errorf("remembered outcome is %q; monitors match remembered", outcomeRemembered)
	}
	if outcomeHeldOut == outcomeRemembered {
		t.Error("both outcomes are the same value, so they distinguish nothing")
	}
}
