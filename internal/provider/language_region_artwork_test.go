package provider

import "testing"

// A language tag may name a country — "es-MX" — and an explicit country setting
// may name a different one. One meaning arriving by two routes needs a stated
// precedence rather than a discovered one.
func TestTheArtworkRegionPrefersTheExplicitCountry(t *testing.T) {
	for _, tc := range []struct {
		name     string
		language string
		country  string
		want     string
	}{
		{"both agree", "es-mx", "MX", "MX"},
		{"only the language names one", "es-mx", "", "MX"},
		{"they disagree; the setting wins", "es-mx", "FR", "FR"},
		{"only the setting names one", "es", "MX", "MX"},
		{"neither names one", "es", "", ""},
		{"a bare language names none", "es", "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := artworkRegion(ArtworkOptions{Language: tc.language, WatchProvidersCountry: tc.country})
			if got != tc.want {
				t.Errorf("artworkRegion = %q, want %q", got, tc.want)
			}
		})
	}
}

// The region steers selection; the language still has to match what a source
// tags an image with, which is the base subtag.
func TestARegionQualifiedTagStillMatchesTheLanguage(t *testing.T) {
	images := []tmdbImage{
		img("/mx.jpg", "es", "MX", 5),
		img("/es.jpg", "es", "ES", 9),
	}
	opts := ArtworkOptions{Language: "es-mx"}
	if got := selectImagePath(images, "/default.jpg", imageLanguageOf(opts.Language), opts); got != "/mx.jpg" {
		t.Errorf("selected %q, want the Mexican poster despite its lower vote", got)
	}
}

// Falling back to another country's art in the same language is the behaviour
// that was asked for; being unable to tell it happened is not.
func TestARegionWithNoArtFallsBackWithinTheLanguage(t *testing.T) {
	images := []tmdbImage{img("/es.jpg", "es", "ES", 9)}
	opts := ArtworkOptions{Language: "es-mx"}
	if got := selectImagePath(images, "/default.jpg", imageLanguageOf(opts.Language), opts); got != "/es.jpg" {
		t.Errorf("selected %q, want the Spanish poster", got)
	}
}
