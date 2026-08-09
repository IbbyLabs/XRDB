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

// The reported defect. An episode id is series, season, episode — a shape the
// kind resolver did not know, so it handed the whole string to TMDB as an
// external id, got no match, and returned an empty kind. RatingsFor then
// matched neither case in its switch and fell through to cfg.Ratings, which the
// reporter had deliberately left blank.
func TestAnEpisodeIdIsASeriesWithoutAskingAnyone(t *testing.T) {
	// No providers: if a kind still comes back it was read off the id rather
	// than looked up, which is the point — a lookup would return "" here.
	p := &Pipeline{}

	for _, id := range []string{
		"tt1442437:3:8", // the reported id
		"tt0903747:1:1", // plain imdb series episode
		"tmdb:1396:1:1", // tmdb-prefixed
		"1396:2:5",      // bare numeric series
		"kitsu:1:1:2",   // an anime episode is still a series episode
	} {
		req := Request{MediaType: "thumbnail", MediaID: id}
		if got := p.resolveContentKind(context.Background(), req); got != "series" {
			t.Errorf("%s resolved to %q, want series", id, got)
		}
	}
}

// Controls: an id with colons in it is not a series for that reason alone, and
// a stated content type still wins.
func TestNonEpisodeIdsAreNotCalledSeries(t *testing.T) {
	p := &Pipeline{}
	for _, id := range []string{
		"tt0068646",   // a film
		"kitsu:2001",  // an anime id with no episode tail
		"tmdb:550",    // a bare tmdb id
		"tt1442437:3", // a season with no episode
	} {
		req := Request{MediaType: "poster", MediaID: id}
		if got := p.resolveContentKind(context.Background(), req); got == "series" {
			t.Errorf("%s resolved to series on an id with no episode", id)
		}
	}

	stated := Request{MediaType: "poster", MediaID: "tt1442437:3:8", ContentType: "movie"}
	if got := p.resolveContentKind(context.Background(), stated); got != "movie" {
		t.Errorf("a stated content type was overridden, got %q", got)
	}
}
