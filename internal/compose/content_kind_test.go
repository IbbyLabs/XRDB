package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider/animemap"
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

// Anything asking what work a request names wants the series id. An episode id
// carries a season and an episode on the end, and every title-keyed lookup
// rejects the whole string — so the same free read that fixed the kind resolver
// has to reach the four other places that ask.
func TestTitleIDStripsTheEpisodeTail(t *testing.T) {
	for id, want := range map[string]string{
		"tt1442437:3:8":  "tt1442437",
		"tt22248376:1:1": "tt22248376",
		"tmdb:1396:1:1":  "tmdb:1396",
		"1396:2:5":       "1396",
		// Not episodes: unchanged, or a colon alone would strip real ids.
		"tt0068646":   "tt0068646",
		"kitsu:2001":  "kitsu:2001",
		"tmdb:550":    "tmdb:550",
		"tt1442437:3": "tt1442437:3",
		"":            "",
		// A scheme name is not a series id.
		"kitsu:11209:1": "kitsu:11209:1",
		"mal:1535:26":   "mal:1535:26",
	} {
		if got := titleID(id); got != want {
			t.Errorf("titleID(%q) = %q, want %q", id, got, want)
		}
	}
}

// titleKeyedResolver answers only for ids that name a title, which is what the
// real anime map does — it is keyed on works, not episodes.
type titleKeyedResolver struct {
	known map[string]animemap.IDs
	asked []string
}

func (r *titleKeyedResolver) Resolve(_ context.Context, _, id string) (animemap.IDs, bool) {
	r.asked = append(r.asked, id)
	ids, ok := r.known[id]
	return ids, ok
}

// The reporter's actual goal: rating sources for series but not for anime. The
// anime override was discarded on every episode because the whole episode id
// went to a map keyed on titles, so an anime episode was never known to be one.
func TestAnAnimeEpisodeIsKnownToBeAnime(t *testing.T) {
	r := &titleKeyedResolver{known: map[string]animemap.IDs{
		"tt22248376": {MAL: 52991, Kitsu: 46165},
	}}
	cfg := imageconfig.Default()
	cfg.RatingsAnime = []string{"mal"}
	p := &Pipeline{anime: r}

	req := Request{MediaType: "thumbnail", MediaID: "tt22248376:1:1", Config: cfg}
	if !p.isAnimeTitle(context.Background(), req) {
		t.Error("an episode of a known anime was not recognised as anime")
	}
	if len(r.asked) == 0 || r.asked[0] != "tt22248376" {
		t.Errorf("the map was asked for %v, want the series id", r.asked)
	}
}

// And the Kitsu artwork id, which nobody reported because its failure is a
// silent fall-through to the next source.
func TestAnAnimeEpisodeResolvesItsKitsuID(t *testing.T) {
	r := &titleKeyedResolver{known: map[string]animemap.IDs{
		"tt22248376": {Kitsu: 46165},
	}}
	p := &Pipeline{anime: r}

	req := Request{MediaType: "thumbnail", MediaID: "tt22248376:1:1"}
	got, ok := p.kitsuID(context.Background(), req)
	if !ok || got != "kitsu:46165" {
		t.Errorf("kitsuID = %q, %v; want kitsu:46165, true", got, ok)
	}
}

// The control: a title the map does not carry is still not an anime, so the fix
// cannot pass by answering yes to everything.
func TestATitleTheMapDoesNotCarryIsNotAnime(t *testing.T) {
	r := &titleKeyedResolver{known: map[string]animemap.IDs{"tt22248376": {MAL: 1}}}
	cfg := imageconfig.Default()
	cfg.RatingsAnime = []string{"mal"}
	p := &Pipeline{anime: r}

	req := Request{MediaType: "thumbnail", MediaID: "tt0903747:1:1", Config: cfg}
	if p.isAnimeTitle(context.Background(), req) {
		t.Error("a series the map does not carry was called anime")
	}
}

func TestStripContentKindPrefixLeavesProvidersABareID(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want string
	}{
		{"series:tt31390543", "tt31390543"},
		{"movie:tt11122698", "tt11122698"},
		{"tv:tt0903747", "tt0903747"},
		{"tt0903747", "tt0903747"},
		{"series:tmdb:330176", "tmdb:330176"},
		{"kitsu:21", "kitsu:21"},
	} {
		if got := stripContentKindPrefix(tc.in); got != tc.want {
			t.Errorf("stripContentKindPrefix(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// The kind token is stripped before providers see the id, so a request that
// names its kind in the id has to carry it across as the content type or the
// provider guesses. TMDB numbers /movie and /tv independently, so the guess
// lands on the wrong title rather than on nothing.
func TestContentKindFromIDReadsBothShapes(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want string
	}{
		{"series:tmdb:279413", "series"},
		{"tv:tmdb:279413", "series"},
		{"movie:tmdb:279413", "movie"},
		{"tmdb:series:279413", "series"},
		{"tmdb:tv:279413", "series"},
		{"tmdb:movie:279413", "movie"},
		{"tmdb:279413", ""},
		{"tt0903747", ""},
		{"series:tt0903747", "series"},
		{"kitsu:21", ""},
		{"", ""},
	} {
		if got := contentKindFromID(tc.in); got != tc.want {
			t.Errorf("contentKindFromID(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
