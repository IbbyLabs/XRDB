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

// The icon modes must change the render, and the styles with no room for a
// glyph must fall back to text.
func TestGenreBadgeIconModes(t *testing.T) {
	genres := []string{"Science Fiction"}

	text := genreTestImage()
	drawGenreBadge(text, genres, "tl", 2.0, newOccupancy(text.Bounds()), genreBadgeOpts{})

	for _, mode := range []string{"icon", "both"} {
		img := genreTestImage()
		drawGenreBadge(img, genres, "tl", 2.0, newOccupancy(img.Bounds()), genreBadgeOpts{mode: mode})
		if !imagesDiffer(text, img) {
			t.Errorf("genre mode %q did not change the render", mode)
		}
	}

	// A title with no genres has no family, so an icon mode renders nothing new.
	empty := genreTestImage()
	drawGenreBadge(empty, nil, "tl", 2.0, newOccupancy(empty.Bounds()), genreBadgeOpts{mode: "both"})
	blank := genreTestImage()
	if imagesDiffer(empty, blank) {
		t.Error("an empty genre list should draw no badge at all")
	}

	// The tile style has no room for a glyph: icon mode must match plain text.
	tileText := genreTestImage()
	drawGenreBadge(tileText, genres, "tl", 2.0, newOccupancy(tileText.Bounds()),
		genreBadgeOpts{style: "tile"})
	tileIcon := genreTestImage()
	drawGenreBadge(tileIcon, genres, "tl", 2.0, newOccupancy(tileIcon.Bounds()),
		genreBadgeOpts{style: "tile", mode: "both"})
	if imagesDiffer(tileText, tileIcon) {
		t.Error("the tile style should ignore the icon mode")
	}
}
