package provider

import "testing"

// FR-147 narrowed the compound only when the keywords settled on one bucket.
// Titles matching both, or neither, fell through and rendered TMDB's raw
// "Sci-Fi & Fantasy" in the sci-fi colour — saying nothing about the title.
// They now resolve to their own family (FR-163).
func TestTheCompoundAlwaysResolvesToAFamily(t *testing.T) {
	cases := []struct {
		name     string
		keywords []string
		want     string
	}{
		{"fantasy only", []string{"magic", "dragon"}, genreFantasy},
		{"sci-fi only", []string{"spacecraft", "alien"}, genreSciFi},
		{"both buckets", []string{"magic", "spacecraft"}, genreSciFantasy},
		{"neither bucket", []string{"police", "newspaper"}, genreSciFantasy},
		{"no keywords at all", nil, genreSciFantasy},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := narrowSciFiFantasy(tc.keywords, "0"); got != tc.want {
				t.Errorf("narrowSciFiFantasy(%v) = %q, want %q", tc.keywords, got, tc.want)
			}
		})
	}
}

// The override list is an editorial call and outranks the new family: these are
// Fantasy first even when they carry both.
func TestTheOverridesStillOutrankTheNewFamily(t *testing.T) {
	both := []string{"magic", "spacecraft"}
	for id := range compoundOverrides {
		got := narrowSciFiFantasy(both, id)
		if got == genreSciFantasy {
			t.Errorf("override %s resolved to %s despite being on the list", id, genreSciFantasy)
		}
		if got != compoundOverrides[id] {
			t.Errorf("override %s = %q, want %q", id, got, compoundOverrides[id])
		}
	}
	if len(compoundOverrides) == 0 {
		t.Fatal("no overrides present, so this test proves nothing")
	}
}
