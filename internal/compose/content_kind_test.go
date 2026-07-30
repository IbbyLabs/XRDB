package compose

import (
	"context"
	"testing"
)

// A TMDB id names the kind in the id itself, so no provider call is needed and
// none should be made — the pipeline here has no providers at all.
func TestResolveContentKindReadsATMDBID(t *testing.T) {
	p := &Pipeline{}
	cases := map[string]string{
		"tmdb:movie:680":   "movie",
		"tmdb:series:1396": "series",
		"tmdb:tv:1396":     "series",
	}
	for id, want := range cases {
		if got := p.resolveContentKind(context.Background(), Request{MediaID: id}); got != want {
			t.Errorf("%s: got %q, want %q", id, got, want)
		}
	}
}

// An explicit hint wins and costs nothing.
func TestResolveContentKindPrefersTheRequestHint(t *testing.T) {
	p := &Pipeline{}
	got := p.resolveContentKind(context.Background(),
		Request{MediaID: "tt0111161", ContentType: "movie"})
	if got != "movie" {
		t.Errorf("got %q, want movie", got)
	}
}

// With nothing to ask, an unresolvable id yields "", which falls through to the
// unqualified config rather than guessing a kind.
func TestResolveContentKindGivesUpQuietly(t *testing.T) {
	p := &Pipeline{}
	if got := p.resolveContentKind(context.Background(), Request{MediaID: "tt0111161"}); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}
