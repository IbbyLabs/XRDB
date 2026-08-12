package imageconfig

import "testing"

// A blank per-kind list means inherit, so it cannot also mean "show nothing".
// Without a separate spelling a user can turn ratings off everywhere or nowhere,
// which is what BUG-247 reported: series thumbnails with ratings and anime
// without them could not be expressed.
func TestAnimeCanBeGivenNoRatingsWhileSeriesKeepsThem(t *testing.T) {
	cfg := Config{
		Ratings:       []string{"imdb", "tmdb"},
		RatingsSeries: []string{"imdb"},
		RatingsAnime:  []string{RatingsNone},
	}

	if got := RatingsFor(cfg, "series", false); len(got) != 1 || got[0] != "imdb" {
		t.Fatalf("control: a plain series resolved %v, want [imdb] — the rest of this test would be vacuous", got)
	}
	if got := RatingsFor(cfg, "series", true); len(got) != 0 {
		t.Errorf("an anime episode resolved %v, want no sources", got)
	}
}

// The existing behaviour has to survive: a config that does not distinguish must
// render exactly as it did before the sentinel existed.
func TestABlankOverrideStillInherits(t *testing.T) {
	cfg := Config{Ratings: []string{"imdb", "tmdb"}}
	for _, tc := range []struct {
		kind  string
		anime bool
	}{{"series", false}, {"series", true}, {"movie", false}} {
		if got := RatingsFor(cfg, tc.kind, tc.anime); len(got) != 2 {
			t.Errorf("kind=%s anime=%v resolved %v, want the global list", tc.kind, tc.anime, got)
		}
	}
}

// Every kind needs the spelling, not just anime — otherwise the same trap sits
// one field over.
func TestEachKindCanBeEmptied(t *testing.T) {
	base := []string{"imdb"}
	cases := []struct {
		name  string
		cfg   Config
		kind  string
		anime bool
	}{
		{"movie", Config{Ratings: base, RatingsMovie: []string{RatingsNone}}, "movie", false},
		{"series", Config{Ratings: base, RatingsSeries: []string{RatingsNone}}, "series", false},
		{"anime", Config{Ratings: base, RatingsAnime: []string{RatingsNone}}, "series", true},
	}
	for _, tc := range cases {
		if got := RatingsFor(tc.cfg, tc.kind, tc.anime); len(got) != 0 {
			t.Errorf("%s resolved %v, want no sources", tc.name, got)
		}
	}
}

// A list mixing the sentinel with real sources has an obvious reading, and
// taking it beats rejecting the config over a value nobody typed deliberately.
func TestTheSentinelIsDroppedFromAMixedList(t *testing.T) {
	cfg := Config{Ratings: []string{"tmdb"}, RatingsAnime: []string{"imdb", RatingsNone}}
	got := RatingsFor(cfg, "series", true)
	if len(got) != 1 || got[0] != "imdb" {
		t.Errorf("mixed list resolved %v, want [imdb]", got)
	}
}

// It is a value rather than an absence, so it survives the omitempty field that
// makes an explicitly empty array indistinguishable from a missing one.
func TestTheSentinelSurvivesAParse(t *testing.T) {
	cfg := Parse([]byte(`{"ratings":["imdb"],"ratingsAnime":["none"]}`))
	if len(cfg.RatingsAnime) != 1 || cfg.RatingsAnime[0] != RatingsNone {
		t.Fatalf("parsed ratingsAnime = %v, want [none]", cfg.RatingsAnime)
	}
	if got := RatingsFor(cfg, "series", true); len(got) != 0 {
		t.Errorf("after a parse, anime resolved %v, want no sources", got)
	}
}
