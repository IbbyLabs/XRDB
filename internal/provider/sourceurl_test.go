package provider

import "testing"

func TestSourceBaseURL(t *testing.T) {
	const def = "https://api.example.invalid/3"

	if got := sourceBaseURL("NOT_SET_ANYWHERE", def); got != def {
		t.Errorf("an unset variable should fall back to the default, got %q", got)
	}

	t.Setenv("XRDB_TESTSOURCE_URL", "http://cache.internal/tmdb/3")
	if got := sourceBaseURL("TESTSOURCE", "https://api.themoviedb.org/3"); got != "http://cache.internal/tmdb/3" {
		t.Errorf("the override was ignored, got %q", got)
	}

	// A trailing slash is significant: kitsuBaseURL and the fanart bases are
	// concatenated with a path rather than resolved as a URL reference, so
	// losing the slash silently mangles every request built from them.
	t.Setenv("XRDB_TESTSOURCE_URL", "http://cache.internal/kitsu/api/edge/anime/")
	if got := sourceBaseURL("TESTSOURCE", "https://kitsu.io/api/edge/anime/"); got != "http://cache.internal/kitsu/api/edge/anime/" {
		t.Errorf("the trailing slash was lost, got %q", got)
	}

	// Whitespace-only is treated as unset rather than as an empty base, which
	// would otherwise turn every request into a relative path.
	t.Setenv("XRDB_TESTSOURCE_URL", "   ")
	if got := sourceBaseURL("TESTSOURCE", def); got != def {
		t.Errorf("a whitespace-only value should fall back to the default, got %q", got)
	}
}
