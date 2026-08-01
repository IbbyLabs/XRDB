package server

import (
	"strings"
	"testing"
)

// The user agent is client-supplied, so an unbounded one would let a caller pad
// every access-log line it produces.
func TestTheLoggedUserAgentIsBounded(t *testing.T) {
	long := strings.Repeat("A", 500)
	got := truncateUA(long)
	if len(got) > 130 {
		t.Fatalf("want a bounded user agent, got %d chars", len(got))
	}
	if !strings.HasSuffix(got, "…") {
		t.Error("a truncated agent should show it was cut")
	}
}

func TestAnOrdinaryUserAgentIsLoggedWhole(t *testing.T) {
	ua := "AIOMetadata/1.2.3 (+https://example.invalid)"
	if got := truncateUA(ua); got != ua {
		t.Errorf("want %q unchanged, got %q", ua, got)
	}
	if got := truncateUA(""); got != "" {
		t.Errorf("want an absent agent to stay empty, got %q", got)
	}
}
