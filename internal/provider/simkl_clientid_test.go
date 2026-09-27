package provider

import (
	"context"
	"strings"
	"testing"
)

func TestSIMKLRefusesAClientIDList(t *testing.T) {
	err := ValidateKeys(map[string]string{KeySIMKL: "aaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbb"})
	if err == nil || !strings.Contains(err.Error(), "SIMKL") {
		t.Fatalf("err = %v, want a SIMKL refusal", err)
	}
}

func TestASavedSIMKLListSendsItsFirstID(t *testing.T) {
	ctx := WithKeys(context.Background(), map[string]string{KeySIMKL: "own1,own2"})
	s := NewSIMKL("server")
	for i := 0; i < 3; i++ {
		if got := s.cred(ctx); got != "own1" {
			t.Fatalf("cred %d = %q, want own1", i, got)
		}
	}
}
