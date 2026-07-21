package compose

import "testing"

func TestResolveGenreFamily(t *testing.T) {
	for _, tc := range []struct {
		name   string
		genres []string
		want   string
	}{
		{"no genres yields no family", nil, ""},
		{"unknown genre falls back to other", []string{"Zzz"}, "other"},
		{"single match", []string{"Horror"}, "horror"},
		{"case and separators are folded", []string{"SCIENCE_FICTION"}, "scifi"},
		{"anime outranks animation", []string{"Animation", "Anime"}, "anime"},
		{"horror outranks drama", []string{"Drama", "Horror"}, "horror"},
		{"documentary outranks comedy", []string{"Comedy", "Documentary"}, "documentary"},
		{"fantasy outranks adventure", []string{"Adventure", "Fantasy"}, "fantasy"},
		{"explicit science fiction outranks fantasy", []string{"Fantasy", "Science Fiction"}, "scifi"},
		{"combined tv genre resolves to scifi", []string{"Sci-Fi & Fantasy"}, "scifi"},
		{"thriller buckets into crime", []string{"Thriller"}, "crime"},
		{"western buckets into action", []string{"Western"}, "action"},
		{"war and politics is distinct from war", []string{"War & Politics"}, "warpolitics"},
		{"war buckets into action", []string{"War"}, "action"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := resolveGenreFamily(tc.genres)
			if tc.want == "" {
				if got != nil {
					t.Fatalf("expected no family, got %q", got.id)
				}
				return
			}
			if got == nil {
				t.Fatalf("expected family %q, got none", tc.want)
			}
			if got.id != tc.want {
				t.Errorf("expected family %q, got %q", tc.want, got.id)
			}
		})
	}
}

func TestGenreFamilyAccentsAreValidHex(t *testing.T) {
	for _, f := range []genreFamily{
		familyAnime, familyAnimation, familyHorror, familyComedy, familyRomance,
		familyAction, familySciFi, familyFantasy, familyCrime, familyDrama,
		familyDocumentary, familyMusic, familyReality, familyFamily, familyHistory,
		familyKids, familyNews, familySoap, familyTalk, familyTVMovie,
		familyWarPolitics, familyOther,
	} {
		if _, err := parseHexColor(f.accent); err != nil {
			t.Errorf("family %q has an unparseable accent %q: %v", f.id, f.accent, err)
		}
		if f.label == "" {
			t.Errorf("family %q has no label", f.id)
		}
	}
}
