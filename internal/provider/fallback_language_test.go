package provider

import "testing"

// A fallback is only useful if it is preferred over the English/canonical pick,
// and only when the requested language actually has nothing.
func TestFallbackLanguageIsUsedOnlyWhenTheRequestedOneHasNothing(t *testing.T) {
	de := "de"
	fr := "fr"
	en := "en"
	imgs := []tmdbImage{
		{FilePath: "/en.jpg", Iso639: &en, VoteAverage: 9},
		{FilePath: "/fr.jpg", Iso639: &fr, VoteAverage: 5},
		{FilePath: "/de.jpg", Iso639: &de, VoteAverage: 4},
	}

	// German requested, German exists: the fallback must not win.
	got := selectImagePath(imgs, "/en.jpg", "de", ArtworkOptions{FallbackLanguage: "fr"})
	if got != "/de.jpg" {
		t.Errorf("with German art present, got %q, want /de.jpg", got)
	}

	// Japanese requested, none present: the French fallback beats the English
	// canonical pick.
	got = selectImagePath(imgs, "/en.jpg", "ja", ArtworkOptions{FallbackLanguage: "fr"})
	if got != "/fr.jpg" {
		t.Errorf("with no Japanese art, got %q, want the /fr.jpg fallback", got)
	}

	// No fallback configured: the canonical pick stands, as before.
	got = selectImagePath(imgs, "/en.jpg", "ja", ArtworkOptions{})
	if got != "/en.jpg" {
		t.Errorf("with no fallback, got %q, want the canonical /en.jpg", got)
	}
}

// A region-qualified fallback has to reduce the same way the primary does.
func TestFallbackLanguageAcceptsARegionTag(t *testing.T) {
	pt := "pt"
	en := "en"
	imgs := []tmdbImage{
		{FilePath: "/en.jpg", Iso639: &en, VoteAverage: 9},
		{FilePath: "/pt.jpg", Iso639: &pt, VoteAverage: 3},
	}
	if got := selectImagePath(imgs, "/en.jpg", "ja", ArtworkOptions{FallbackLanguage: "pt-BR"}); got != "/pt.jpg" {
		t.Errorf("pt-BR fallback got %q, want /pt.jpg", got)
	}
}
