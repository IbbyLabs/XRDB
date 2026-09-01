package provider

import "testing"

func img(path, lang, country string, votes float64) tmdbImage {
	i := tmdbImage{FilePath: path, VoteAverage: votes}
	if lang != "" {
		i.Iso639 = &lang
	}
	if country != "" {
		i.Iso3166 = &country
	}
	return i
}

// A language spans countries — es is ES and MX — and TMDB says which on every
// image that carries a language. Artwork published for another country is still
// in the right language, so the region narrows within it (FR-197).
func TestArtworkPrefersTheConfiguredRegionWithinALanguage(t *testing.T) {
	images := []tmdbImage{
		img("/spain.jpg", "es", "ES", 9),
		img("/mexico.jpg", "es", "MX", 5),
	}

	got := selectImagePath(images, "/default.jpg", "es", ArtworkOptions{WatchProvidersCountry: "MX"})
	if got != "/mexico.jpg" {
		t.Errorf("got %q, want the Mexican poster despite its lower vote", got)
	}

	// The control: with no region asked for, the higher-voted one wins, so the
	// region is doing the work rather than the ordering.
	if got := selectImagePath(images, "/default.jpg", "es", ArtworkOptions{WatchProvidersCountry: "ES"}); got != "/spain.jpg" {
		t.Errorf("ES gave %q, want the Spanish poster", got)
	}
}

// A preference and not a filter: a title with nothing for this country keeps
// its language rather than falling through to English.
func TestARegionMissKeepsTheLanguage(t *testing.T) {
	images := []tmdbImage{
		img("/spain.jpg", "es", "ES", 7),
		img("/english.jpg", "en", "US", 9),
	}

	if got := selectImagePath(images, "/english.jpg", "es", ArtworkOptions{WatchProvidersCountry: "MX"}); got != "/spain.jpg" {
		t.Errorf("got %q, want the Spanish poster rather than the English default", got)
	}
}

// Textless art carries neither a language nor a country, so the region cannot
// demote it: it is chosen by the text preference and never by this comparison.
func TestTheRegionDoesNotReachTextlessArt(t *testing.T) {
	images := []tmdbImage{
		img("/textless.jpg", "", "", 6),
		img("/spain.jpg", "es", "ES", 9),
	}

	got := selectImagePath(images, "/default.jpg", "es",
		ArtworkOptions{TextPreference: "textless", WatchProvidersCountry: "MX"})
	if got != "/textless.jpg" {
		t.Errorf("got %q, want the textless poster", got)
	}
}
