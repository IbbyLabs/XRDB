package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

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
}

// OMDB only ever supplies a poster, so it may lead the order on the poster
// surface and must step aside everywhere else.
func TestArtworkOrderGatesOMDBToPosters(t *testing.T) {
	p := &Pipeline{}
	poster := p.artworkOrder("omdb", "poster")
	if len(poster) == 0 || poster[0] != "omdb" {
		t.Errorf("omdb should lead on posters, got %v", poster)
	}
	for _, surface := range []string{"backdrop", "logo", "thumbnail"} {
		order := p.artworkOrder("omdb", surface)
		for _, name := range order {
			if name == "omdb" {
				t.Errorf("omdb should not appear for %s, got %v", surface, order)
			}
		}
		if len(order) == 0 {
			t.Errorf("%s must still have fallback sources", surface)
		}
	}
	// An unrelated primary is untouched on every surface.
	if got := p.artworkOrder("fanart", "backdrop"); got[0] != "fanart" {
		t.Errorf("fanart should lead, got %v", got)
	}
}

func TestReleaseStatusBadge(t *testing.T) {
	blank := genreTestImage()

	for _, status := range []string{"digital", "cinemas"} {
		img := genreTestImage()
		drawReleaseStatusBadge(img, status, "tr", 2.0, newOccupancy(img.Bounds()), releaseStatusOpts{})
		if !imagesDiffer(blank, img) {
			t.Errorf("release status %q drew nothing", status)
		}
	}

	// The two states must be visually distinct, not just both present.
	digital := genreTestImage()
	drawReleaseStatusBadge(digital, "digital", "tr", 2.0, newOccupancy(digital.Bounds()), releaseStatusOpts{})
	cinemas := genreTestImage()
	drawReleaseStatusBadge(cinemas, "cinemas", "tr", 2.0, newOccupancy(cinemas.Bounds()), releaseStatusOpts{})
	if !imagesDiffer(digital, cinemas) {
		t.Error("digital and cinemas rendered identically")
	}

	// An unknown or absent status must draw nothing at all.
	for _, status := range []string{"", "physical", "nonsense"} {
		img := genreTestImage()
		drawReleaseStatusBadge(img, status, "tr", 2.0, newOccupancy(img.Bounds()), releaseStatusOpts{})
		if imagesDiffer(blank, img) {
			t.Errorf("status %q should draw nothing", status)
		}
	}
}

// Anime grouping decides whether a mapped anime reads as ANIME, folds in with
// animation generally, or defers to its next strongest genre.
func TestGenreFamilyAnimeGrouping(t *testing.T) {
	// Ghost in the Shell: animated, science fiction, action.
	genres := []string{"Animation", "Science Fiction", "Action"}

	for _, tc := range []struct {
		grouping string
		isAnime  bool
		want     string
	}{
		{"", true, "anime"}, // split is the default
		{"split", true, "anime"},
		{"animation", true, "animation"}, // folded in with animation
		{"secondary", true, "scifi"},     // defers to the next strongest genre
		{"split", false, "animation"},    // not mapped as anime
		{"secondary", false, "scifi"},    // secondary applies to animation too
	} {
		got := resolveGenreFamilyGrouped(genres, tc.isAnime, tc.grouping)
		if got == nil || got.id != tc.want {
			id := "nil"
			if got != nil {
				id = got.id
			}
			t.Errorf("grouping=%q isAnime=%v: got %s, want %s", tc.grouping, tc.isAnime, id, tc.want)
		}
	}

	// With nothing else to fall back to, secondary keeps the anime family.
	only := resolveGenreFamilyGrouped([]string{"Animation"}, true, "secondary")
	if only == nil || only.id != "anime" {
		t.Error("secondary with no other genre should stay on anime")
	}
}

// Cinemeta returns IMDb's genre vocabulary, which spells several of these
// differently from TMDB. They must still reach the right family.
func TestGenreFamilyIMDbVocabulary(t *testing.T) {
	for _, tc := range []struct{ genre, want string }{
		{"Sci-Fi", "scifi"},
		{"Reality-TV", "reality"},
		{"Talk-Show", "talk"},
		{"Musical", "music"},
		{"Documentary", "documentary"},
	} {
		got := resolveGenreFamily([]string{tc.genre})
		if got == nil || got.id != tc.want {
			id := "nil"
			if got != nil {
				id = got.id
			}
			t.Errorf("%q resolved to %s, want %s", tc.genre, id, tc.want)
		}
	}
}

// An explicit value colour must override the style/theme default.
func TestAggregateValueColorOverridesBadgeText(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb"}}
	def := chromeFor(cfg)
	cfg.AggregateValueColor = "#ff00ff"
	got := chromeFor(cfg)
	if got.valueColor == def.valueColor {
		t.Error("aggregateValueColor did not change the badge value colour")
	}
	if got.valueColor.R != 255 || got.valueColor.G != 0 || got.valueColor.B != 255 {
		t.Errorf("unexpected value colour %+v", got.valueColor)
	}
}

// TMDB's television compound made fantasy unreachable on three separate
// surfaces, and the narrowing has to fix all of them or the Short names toggle
// silently puts "Sci-Fi" back on a fantasy series (FR-147).
func TestNarrowedCompoundReachesEveryGenreSurface(t *testing.T) {
	compound := []string{"Sci-Fi & Fantasy", "Drama", "Action & Adventure"}
	narrowed := []string{"Fantasy", "Drama", "Action & Adventure"}

	// 1. The family, which picks the glyph and the accent colour.
	if fam := resolveGenreFamily(compound); fam == nil || fam.id != "scifi" {
		t.Fatalf("the compound no longer resolves to sci-fi, so this test is not measuring the defect")
	}
	fam := resolveGenreFamily(narrowed)
	if fam == nil || fam.id != "fantasy" {
		t.Errorf("narrowed genres resolve to %v, want the fantasy family", fam)
	}

	// 2. The full label is the genre name itself, so narrowing carries it.
	if narrowed[0] != "Fantasy" {
		t.Errorf("the leading genre is %q, want Fantasy", narrowed[0])
	}

	// 3. The short label. This is the one that hides: it only runs with Short
	// names on, and it maps the compound to "Sci-Fi" regardless of the family.
	if got := shortenGenres(compound)[0]; got != "Sci-Fi" {
		t.Fatalf("the compound's short name is %q, so this test is not measuring the defect", got)
	}
	if got := shortenGenres(narrowed)[0]; got != "Fantasy" {
		t.Errorf("the narrowed genre's short name is %q, want it left as Fantasy", got)
	}
}
