package compose

import (
	"image"
	"image/color"
	"path/filepath"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func drawsSomething(draw func(*image.NRGBA, *occupancy)) bool {
	base := image.NewNRGBA(image.Rect(0, 0, 400, 300))
	bg := color.NRGBA{R: 90, G: 120, B: 150, A: 255}
	for y := range 300 {
		for x := range 400 {
			base.SetNRGBA(x, y, bg)
		}
	}
	draw(base, newOccupancy(base.Bounds()))
	for y := range 300 {
		for x := range 400 {
			if base.NRGBAAt(x, y) != bg {
				return true
			}
		}
	}
	return false
}

// A grid where one poster has badges and the one beside it has none reads as
// ragged. Each placeholder is off by default, so no poster gains a badge it has
// never drawn (FR-204).
func TestEachPlaceholderIsOffByDefault(t *testing.T) {
	cfg := imageconfig.Default()
	if cfg.GenrePlaceholder || cfg.AgeRatingPlaceholder || cfg.RatingRingPlaceholder {
		t.Fatal("a placeholder defaults on; every poster with nothing to show would gain a badge")
	}

	for _, tc := range []struct {
		name string
		draw func(*image.NRGBA, *occupancy)
	}{
		{"genre", func(b *image.NRGBA, occ *occupancy) {
			drawGenreBadge(b, nil, "tl", 2, occ, genreOptsFromConfig(cfg, false, "movie"))
		}},
		{"age", func(b *image.NRGBA, occ *occupancy) {
			drawAgeRatingBadge(b, "", "tl", 2, occ, ageOptsFromConfig(cfg))
		}},
	} {
		if drawsSomething(tc.draw) {
			t.Errorf("the %s badge drew a placeholder with the setting off", tc.name)
		}
	}
}

// The media type rather than the "other" family: that family means the genres
// were not recognised, which is a different statement from there being none.
func TestTheGenrePlaceholderIsTheMediaType(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.GenrePlaceholder = true

	for _, tc := range []struct {
		isAnime bool
		kind    string
		want    string
	}{
		// ANIME is a genre family, so the placeholder says nothing rather than
		// drawing a word that means something else on a title that has genres.
		{true, "series", "N/A"},
		{false, "series", "SHOW"},
		{false, "movie", "MOVIE"},
		{false, "", "MOVIE"},
	} {
		if got := genrePlaceholderFor(cfg, tc.isAnime, tc.kind); got != tc.want {
			t.Errorf("anime=%v kind=%q gave %q, want %q", tc.isAnime, tc.kind, got, tc.want)
		}
	}
	// The control: with the setting off there is no placeholder at all, so the
	// media type is not simply always returned.
	cfg.GenrePlaceholder = false
	if got := genrePlaceholderFor(cfg, true, "series"); got != "" {
		t.Errorf("placeholder with the setting off = %q", got)
	}
}

// A free-text certificate would be drawn as though a source had supplied it.
func TestTheAgePlaceholderIsFixed(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.AgeRatingPlaceholder = true
	if got := agePlaceholderFor(cfg); got != "NR" {
		t.Errorf("age placeholder = %q, want NR", got)
	}
	cfg.AgeRatingPlaceholder = false
	if got := agePlaceholderFor(cfg); got != "" {
		t.Errorf("placeholder with the setting off = %q", got)
	}
}

// The empty ring is the outline with no arc and no number, so it reads as
// nothing to show rather than as a score of zero.
func TestTheEmptyRingDrawsWithoutAValue(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingRing = true
	cfg.Ratings = []string{"imdb"}

	off := drawsSomething(func(b *image.NRGBA, occ *occupancy) {
		drawAverageRatingRing(b, nil, cfg, 2, occ)
	})
	if off {
		t.Error("a ring drew with no ratings and the placeholder off")
	}

	cfg.RatingRingPlaceholder = true
	on := drawsSomething(func(b *image.NRGBA, occ *occupancy) {
		drawAverageRatingRing(b, nil, cfg, 2, occ)
	})
	if !on {
		t.Error("the empty ring drew nothing with the placeholder on")
	}

	// The control: a ring with real ratings still draws, so the placeholder has
	// not replaced the ordinary path.
	withRatings := drawsSomething(func(b *image.NRGBA, occ *occupancy) {
		drawAverageRatingRing(b, []provider.Rating{{Source: "imdb", Value: 8.4}}, cfg, 2, occ)
	})
	if !withRatings {
		t.Error("a ring with ratings drew nothing")
	}
}

// A placeholder that fills the gap with something true and one that says there
// is nothing are different answers, and absence and still-loading look the same
// on a poster without the second (FR-205).
func TestTheMarkerStyleSaysThereIsNothing(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.GenrePlaceholder = true
	cfg.AgeRatingPlaceholder = true

	// Default is the value style, so nothing changes for a config written before
	// this setting existed.
	if got := genrePlaceholderFor(cfg, false, "movie"); got != "MOVIE" {
		t.Errorf("default genre placeholder = %q, want MOVIE", got)
	}
	if got := agePlaceholderFor(cfg); got != "NR" {
		t.Errorf("default age placeholder = %q, want NR", got)
	}

	cfg.PlaceholderStyle = "marker"
	for _, tc := range []struct{ name, got string }{
		{"genre", genrePlaceholderFor(cfg, false, "movie")},
		{"anime genre", genrePlaceholderFor(cfg, true, "series")},
		{"age", agePlaceholderFor(cfg)},
	} {
		if tc.got != "N/A" {
			t.Errorf("marker %s = %q, want N/A", tc.name, tc.got)
		}
	}
}

// The hatching is what makes a marker unmistakably no-value rather than a
// colour a reader could take for a genre, so it has to reach the plate.
func TestTheMarkerPlateIsHatched(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.GenrePlaceholder = true
	cfg.AgeRatingPlaceholder = true

	plain := ageOptsFromConfig(cfg)
	if plain.hatched {
		t.Error("the value style hatches its plate")
	}
	cfg.PlaceholderStyle = "marker"
	if !ageOptsFromConfig(cfg).hatched {
		t.Error("the marker style does not hatch the age plate")
	}
	if !genreOptsFromConfig(cfg, false, "movie").hatched {
		t.Error("the marker style does not hatch the genre plate")
	}

	// And it draws differently, rather than the flag being carried and ignored.
	marked := drawsSomething(func(b *image.NRGBA, occ *occupancy) {
		drawAgeRatingBadge(b, "", "tl", 2, occ, ageOptsFromConfig(cfg))
	})
	if !marked {
		t.Error("the marker age badge drew nothing")
	}
}

// A thumbnail draws these at a fraction of a poster's size, and thin diagonal
// lines are the first thing to disappear at that scale. The hatch spacing is in
// output pixels rather than scaled for that reason: a hatch that closes into a
// grey smear says less than no hatch at all.
func TestTheHatchSurvivesASmallBadge(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.AgeRatingPlaceholder = true
	cfg.PlaceholderStyle = "marker"
	bg := color.NRGBA{R: 120, G: 160, B: 200, A: 255}

	for _, scale := range []float64{0.5, 1, 2} {
		base := image.NewNRGBA(image.Rect(0, 0, 400, 200))
		for y := range 200 {
			for x := range 400 {
				base.SetNRGBA(x, y, bg)
			}
		}
		drawAgeRatingBadge(base, "", "tl", scale, newOccupancy(base.Bounds()), ageOptsFromConfig(cfg))

		minX, maxX, lastY := 400, 0, 0
		for y := range 200 {
			for x := range 400 {
				if base.NRGBAAt(x, y) != bg {
					if x < minX {
						minX = x
					}
					if x > maxX {
						maxX = x
					}
					lastY = y
				}
			}
		}
		transitions, prev := 0, -1
		for x := minX + 2; x < maxX-2; x++ {
			c := base.NRGBAAt(x, lastY/2)
			cur := 0
			if (int(c.R)+int(c.G)+int(c.B))/3 > 60 {
				cur = 1
			}
			if prev >= 0 && cur != prev {
				transitions++
			}
			prev = cur
		}
		if transitions < 6 {
			t.Errorf("scale %.1f: %d light-dark transitions across a %dpx plate; the hatch has closed up",
				scale, transitions, maxX-minX)
		}
	}
}

// ANIME is a genre family. With the value placeholder on, a title classified as
// anime and a title we know nothing about would draw the same badge with
// opposite meanings, and Romaa reported the blank ones are mostly anime OVAs —
// so it is the common case rather than an edge (FR-205 followup).
func TestAPlaceholderNeverDrawsAWordThatIsAlsoAGenre(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.GenrePlaceholder = true

	if got := genrePlaceholderFor(cfg, true, "series"); got != "N/A" {
		t.Errorf("an anime with no genres gave %q; ANIME is a family label", got)
	}
	// MOVIE and SHOW are not families, so they still say something true.
	if got := genrePlaceholderFor(cfg, false, "movie"); got != "MOVIE" {
		t.Errorf("a film gave %q, want MOVIE", got)
	}
	if got := genrePlaceholderFor(cfg, false, "series"); got != "SHOW" {
		t.Errorf("a series gave %q, want SHOW", got)
	}
}

// The collision a reader sees is between two drawn strings, so it is judged in
// the render's language rather than in English. A language whose word for a
// media type differs from the family's has no collision to avoid.
func TestTheCollisionIsJudgedInTheRenderLanguage(t *testing.T) {
	dir := t.TempDir()
	// "anime" as a family is Anime; the media-type word is deliberately not.
	write(t, filepath.Join(dir, "xx.json"),
		`{"anime": "Anime", "_ui": {"placeholder_anime": "Desenho", "placeholder_none": "N/D"}}`)
	t.Setenv(labelLanguagesDirEnv, dir)
	resetFamilyLabels(t)

	cfg := imageconfig.Default()
	cfg.GenrePlaceholder = true
	cfg.Language = "xx"
	if got := genrePlaceholderFor(cfg, true, "series"); got != "Desenho" {
		t.Errorf("got %q; the words differ in this language so there is no collision", got)
	}

	// The control: make them match and the marker comes back, so the comparison
	// is doing the work rather than the language being ignored.
	write(t, filepath.Join(dir, "xx.json"),
		`{"anime": "Desenho", "_ui": {"placeholder_anime": "Desenho", "placeholder_none": "N/D"}}`)
	resetFamilyLabels(t)
	if got := genrePlaceholderFor(cfg, true, "series"); got != "N/D" {
		t.Errorf("got %q, want the marker once the words match", got)
	}
}

// Derived from the family table rather than naming the words that collide, so a
// family added later is covered without anyone remembering this.
func TestTheCollisionCheckReadsTheFamilyTable(t *testing.T) {
	resetFamilyLabels(t)
	for _, f := range genreFamilies() {
		if !labelIsAFamily(f.label, "en") {
			t.Errorf("%q is a family label and the check does not see it", f.label)
		}
	}
	if labelIsAFamily("MOVIE", "en") || labelIsAFamily("SHOW", "en") {
		t.Error("a media type that is not a family was treated as one")
	}
}

// The caller says what the title is, in the type field or in the id's own
// prefix. req.ContentType is only filled when a per-type override made the
// render resolve it, so a "series:" request reached the placeholder as no kind
// at all and drew MOVIE.
func TestThePlaceholderDrawsTheKindTheCallerNamed(t *testing.T) {
	for _, tc := range []struct {
		req  Request
		want string
	}{
		{Request{ContentType: "series", MediaID: "tt0903747"}, "series"},
		{Request{MediaID: "series:mal:64844"}, "series"},
		{Request{MediaID: "movie:mal:64844"}, "movie"},
		{Request{MediaID: "tmdb:series:1396"}, "series"},
		// A caller that named nothing gets nothing, rather than a lookup.
		{Request{MediaID: "tt0111161"}, ""},
	} {
		if got := statedContentKind(tc.req); got != tc.want {
			t.Errorf("%+v gave %q, want %q", tc.req, got, tc.want)
		}
	}

	cfg := imageconfig.Default()
	cfg.GenrePlaceholder = true
	if got := genrePlaceholderFor(cfg, false, statedContentKind(Request{MediaID: "series:mal:64844"})); got != "SHOW" {
		t.Errorf("a series request drew %q, want SHOW", got)
	}
}
