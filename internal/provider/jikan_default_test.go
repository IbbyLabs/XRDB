package provider

import "testing"

// The default is somebody else's donated instance, and the one it replaced is
// closing. A test rather than a comment because the value is a bare string that
// reads as arbitrary, and the previous one looked equally settled for years.
func TestTheJikanDefaultIsNotTheClosingPublicInstance(t *testing.T) {
	if jikanBaseURL == "" {
		t.Fatal("no default Jikan URL")
	}
	if host := JikanHost(""); host == "api.jikan.moe" {
		t.Fatalf("the default still points at the instance that is shutting down: %s", host)
	}
}
