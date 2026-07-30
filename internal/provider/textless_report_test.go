package provider

import (
	"encoding/json"
	"testing"
)

func lang(s string) *string { return &s }

// TMDB tags art carrying a title with its language, so an absent or empty
// iso_639_1 is the only signal that a poster is bare.
func TestTMDBReportsWhetherThePosterIsTextless(t *testing.T) {
	images := []tmdbImage{
		{FilePath: "/bare.jpg", Iso639: nil},
		{FilePath: "/empty.jpg", Iso639: lang("")},
		{FilePath: "/english.jpg", Iso639: lang("en")},
	}
	for path, want := range map[string]bool{
		"/bare.jpg":    true,
		"/empty.jpg":   true,
		"/english.jpg": false,
		"/absent.jpg":  false, // unknown art is never assumed bare
		"":             false,
	} {
		if got := pathIsTextless(images, path); got != want {
			t.Errorf("pathIsTextless(%q) = %v, want %v", path, got, want)
		}
	}
}

// Fanart's language buckets fall through, so a "00" request can return English
// art. The report has to describe what came back, not what was asked for.
func TestFanartReportsTheLanguageOfWhatItReturned(t *testing.T) {
	raw := map[string]json.RawMessage{
		"movieposter": json.RawMessage(`[
			{"url":"https://f/bare.jpg","lang":"00"},
			{"url":"https://f/english.jpg","lang":"en"}
		]`),
	}
	if !fanartURLIsLang(raw, "https://f/bare.jpg", "00", "movieposter", "tvposter") {
		t.Error("language-neutral art was not reported as textless")
	}
	if fanartURLIsLang(raw, "https://f/english.jpg", "00", "movieposter", "tvposter") {
		t.Error("English art was reported as textless")
	}
	if fanartURLIsLang(raw, "https://f/unknown.jpg", "00", "movieposter") {
		t.Error("art absent from the record was reported as textless")
	}
	if fanartURLIsLang(raw, "", "00", "movieposter") {
		t.Error("an empty url was reported as textless")
	}
}
