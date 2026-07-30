package provider

import "testing"

// The original-language request cannot send include_image_language, so TMDB
// answers with every language. Logos have no canonical path to fall back on, so
// the pick landed on the top-voted image whatever language it carried — a
// Portuguese wordmark on an English title.
func TestAnEnglishTitleGetsAnEnglishLogoUnderOriginalLanguage(t *testing.T) {
	logos := []tmdbImage{
		{FilePath: "/pt.png", Iso639: strptr("pt"), VoteAverage: 9},
		{FilePath: "/en.png", Iso639: strptr("en"), VoteAverage: 2},
		{FilePath: "/zh.png", Iso639: strptr("zh"), VoteAverage: 8},
	}
	if got := selectImagePath(logos, "", "en", ArtworkOptions{}); got != "/en.png" {
		t.Errorf("got %q, want the English logo even though it is not top-voted", got)
	}
}

// The same must hold for a non-English original, which already worked.
func TestAJapaneseTitleKeepsItsJapaneseLogo(t *testing.T) {
	logos := []tmdbImage{
		{FilePath: "/en.png", Iso639: strptr("en"), VoteAverage: 9},
		{FilePath: "/ja.png", Iso639: strptr("ja"), VoteAverage: 1},
	}
	if got := selectImagePath(logos, "", "ja", ArtworkOptions{}); got != "/ja.png" {
		t.Errorf("got %q, want the Japanese logo", got)
	}
}

// A language-neutral wordmark reads correctly anywhere, so it beats art tagged
// for a language nobody asked for.
func TestANeutralLogoBeatsAForeignOneWhenTheLanguageIsAbsent(t *testing.T) {
	logos := []tmdbImage{
		{FilePath: "/pt.png", Iso639: strptr("pt"), VoteAverage: 9},
		{FilePath: "/neutral.png", Iso639: nil, VoteAverage: 1},
	}
	if got := selectImagePath(logos, "", "en", ArtworkOptions{}); got != "/neutral.png" {
		t.Errorf("got %q, want the language-neutral wordmark", got)
	}
}

// With nothing in the language and nothing neutral, any logo beats none.
func TestAForeignLogoIsStillBetterThanNothing(t *testing.T) {
	logos := []tmdbImage{{FilePath: "/pt.png", Iso639: strptr("pt"), VoteAverage: 9}}
	if got := selectImagePath(logos, "", "en", ArtworkOptions{}); got != "/pt.png" {
		t.Errorf("got %q, want the only logo available", got)
	}
}

// Posters are untouched: they carry TMDB's canonical pick, which still wins for
// an English request rather than being re-ranked by vote.
func TestAnEnglishPosterStillTakesTheCanonicalPick(t *testing.T) {
	posters := []tmdbImage{
		{FilePath: "/other-en.png", Iso639: strptr("en"), VoteAverage: 9},
		{FilePath: "/canonical.png", Iso639: strptr("en"), VoteAverage: 1},
	}
	if got := selectImagePath(posters, "/canonical.png", "en", ArtworkOptions{}); got != "/canonical.png" {
		t.Errorf("got %q, want TMDB's canonical poster", got)
	}
}

func strptr(s string) *string { return &s }
