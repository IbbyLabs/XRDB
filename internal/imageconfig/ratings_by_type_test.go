package imageconfig

import (
	"reflect"
	"testing"
)

// Different sources suit different kinds of title: MAL and AniList mean nothing
// for a film, and an anime poster showing only anime ratings is the whole of
// FR-111. An unset override has to leave existing configs untouched.
func TestRatingsForPicksTheOverrideForTheKindOfTitle(t *testing.T) {
	base := Default()
	base.Ratings = []string{"imdb", "tmdb"}
	base.RatingsMovie = []string{"imdb", "rt"}
	base.RatingsSeries = []string{"tmdb", "trakt"}
	base.RatingsAnime = []string{"mal", "anilist"}

	for _, tc := range []struct {
		name        string
		contentType string
		isAnime     bool
		want        []string
	}{
		{"a film takes the movie list", "movie", false, []string{"imdb", "rt"}},
		{"a show takes the series list", "series", false, []string{"tmdb", "trakt"}},
		{"tv is the same as series", "tv", false, []string{"tmdb", "trakt"}},
		// An anime is also a series, so the more specific answer has to win or
		// the anime list could never apply.
		{"anime beats series", "series", true, []string{"mal", "anilist"}},
		{"anime beats movie", "movie", true, []string{"mal", "anilist"}},
		{"an unknown kind falls back", "", false, []string{"imdb", "tmdb"}},
	} {
		if got := RatingsFor(base, tc.contentType, tc.isAnime); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}

// A config that does not set any override must behave exactly as before.
func TestRatingsForLeavesAPlainConfigAlone(t *testing.T) {
	cfg := Default()
	cfg.Ratings = []string{"imdb", "tmdb"}
	for _, ct := range []string{"movie", "series", "tv", ""} {
		for _, anime := range []bool{false, true} {
			if got := RatingsFor(cfg, ct, anime); !reflect.DeepEqual(got, cfg.Ratings) {
				t.Errorf("contentType=%q anime=%v: got %v, want the plain list", ct, anime, got)
			}
		}
	}
}

// The override reaches the cache key, or two titles of different kinds would
// share a cached image.
func TestPerTypeRatingsReachTheCacheKey(t *testing.T) {
	a := Default()
	b := Default()
	b.RatingsAnime = []string{"mal"}
	if CacheKey(a) == CacheKey(b) {
		t.Error("ratingsAnime does not change the cache key")
	}
}

// Provider selection runs before the kind of title is known, so it has to fetch
// every source any list might ask for. Fetching only cfg.Ratings meant an
// override named a source that was never fetched, and the badge silently
// vanished instead of changing.
func TestRatingsCandidatesCoversEveryList(t *testing.T) {
	cfg := Default()
	cfg.Ratings = []string{"imdb"}
	cfg.RatingsMovie = []string{"imdb", "rt"}
	cfg.RatingsAnime = []string{"mal", "anilist"}

	got := RatingsCandidates(cfg)
	for _, want := range []string{"imdb", "rt", "mal", "anilist"} {
		found := false
		for _, g := range got {
			if g == want {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("%q is in an override but not among the candidates %v", want, got)
		}
	}
	if len(got) != 4 {
		t.Errorf("candidates = %v, want four distinct sources", got)
	}
}

// A config with no overrides must return the plain list untouched, so nothing
// extra is fetched for the configs that do not use this.
func TestRatingsCandidatesIsThePlainListWithoutOverrides(t *testing.T) {
	cfg := Default()
	cfg.Ratings = []string{"imdb", "tmdb"}
	if got := RatingsCandidates(cfg); !reflect.DeepEqual(got, cfg.Ratings) {
		t.Errorf("got %v, want the plain list %v", got, cfg.Ratings)
	}
}
