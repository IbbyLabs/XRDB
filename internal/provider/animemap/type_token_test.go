package animemap

import "testing"

// AIOMetadata's {type}:{id} pattern puts the content type in front of whatever
// id it has, including the anime namespaces. The type says nothing about which
// service the id belongs to, so it must not stop the lookup.
func TestParseAnimeIDAcceptsALeadingTypeToken(t *testing.T) {
	for _, tc := range []struct {
		in      string
		service string
		num     int
	}{
		{"mal:21", "mal", 21},
		{"series:mal:21", "mal", 21},
		{"movie:mal:21", "mal", 21},
		{"tv:anilist:21", "anilist", 21},
		{"series:kitsu:12", "kitsu", 12},
		{"kitsu:12", "kitsu", 12},
	} {
		service, num, ok := ParseAnimeID(tc.in)
		if !ok || service != tc.service || num != tc.num {
			t.Errorf("ParseAnimeID(%q) = (%q, %d, %v), want (%q, %d, true)",
				tc.in, service, num, ok, tc.service, tc.num)
		}
	}
}

// A type token alone is not an anime id, and a non-anime namespace stays
// unrecognised whether or not it carries one.
func TestParseAnimeIDStillRejectsWhatIsNotAnime(t *testing.T) {
	for _, in := range []string{"series:", "series:tmdb:1396", "tmdb:1396", "series:tt0903747"} {
		if _, _, ok := ParseAnimeID(in); ok {
			t.Errorf("ParseAnimeID(%q) reported an anime id", in)
		}
	}
}
