package compose

import (
	"image"
	"image/color"
	"sync"
	"testing"

	"golang.org/x/image/font"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

var badgeFontFamilies = []string{"sans", "serif", "mono", "display"}

func renderGenre(genres []string, opts genreBadgeOpts) *image.NRGBA {
	img := genreTestImage()
	drawGenreBadge(img, genres, "bl", 1.0, newOccupancy(img.Bounds()), opts)
	return img
}

func renderStrip(font string) *image.NRGBA {
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb"}
	cfg.RatingsLayout = imageconfig.LayoutBottom
	cfg.RatingBadgeFont = font
	ratings := []provider.Rating{
		{Source: "imdb", Value: 8.5, Label: "8.5"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
	}
	img := genreTestImage()
	drawBadgesInPlace("", img, ratings, cfg, titleFacts{})
	return img
}

func inkPixels(img *image.NRGBA) int {
	n := 0
	for i := 3; i < len(img.Pix); i += 4 {
		if img.Pix[i] > 0 {
			n++
		}
	}
	return n
}

func TestEveryBadgeFontRendersAGenreBadge(t *testing.T) {
	genres := []string{"Action", "Drama"}
	def := renderGenre(genres, genreBadgeOpts{})
	for _, fam := range badgeFontFamilies {
		got := renderGenre(genres, genreBadgeOpts{font: fam})
		if inkPixels(got) == 0 {
			t.Errorf("%s: the genre badge drew nothing", fam)
		}
		if !imagesDiffer(def, got) {
			t.Errorf("%s: the genre badge is identical to the default face", fam)
		}
	}
}

func TestEveryBadgeFontRendersRatingBadges(t *testing.T) {
	def := renderStrip("")
	for _, fam := range badgeFontFamilies {
		got := renderStrip(fam)
		if inkPixels(got) == 0 {
			t.Errorf("%s: the rating badges drew nothing", fam)
		}
		if !imagesDiffer(def, got) {
			t.Errorf("%s: the rating badges are identical to the default face", fam)
		}
	}
}

func TestBadgeFontReachesAggregatePillsAndTheRing(t *testing.T) {
	ratings := []provider.Rating{
		{Source: "imdb", Value: 8.5, Label: "8.5"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
	}
	pill := func(font string) *image.NRGBA {
		img := genreTestImage()
		drawScorePill(img, 200, 480, "AVG", "8.4", nil, scorePillStyle{font: font}, 1, newOccupancy(img.Bounds()))
		return img
	}
	ring := func(font string) *image.NRGBA {
		cfg := imageconfig.Default()
		cfg.RatingRing = true
		cfg.Ratings = []string{"imdb", "tmdb"}
		cfg.RatingBadgeFont = font
		img := genreTestImage()
		drawAverageRatingRing(img, ratings, cfg, 1, newOccupancy(img.Bounds()))
		return img
	}
	editorial := func(font string) *image.NRGBA {
		cfg := imageconfig.Default()
		cfg.Ratings = []string{"imdb", "tmdb"}
		cfg.RatingBadgeFont = font
		img := genreTestImage()
		drawEditorialRating(img, ratings, []string{"Crime"}, cfg, 1, newOccupancy(img.Bounds()))
		return img
	}
	for name, draw := range map[string]func(string) *image.NRGBA{"pill": pill, "ring": ring, "editorial": editorial} {
		def := draw("")
		if inkPixels(def) == 0 {
			t.Fatalf("%s: the default render drew nothing", name)
		}
		for _, fam := range badgeFontFamilies {
			if !imagesDiffer(def, draw(fam)) {
				t.Errorf("%s: %s is identical to the default face", name, fam)
			}
		}
	}
}

// The clean style keeps its own Liberation Sans Bold face; sans is that same
// face, so only the other families change it.
func TestCleanGenreLabelKeepsItsFaceUnlessAFontIsPicked(t *testing.T) {
	genres := []string{"Action", "Drama"}
	def := renderGenre(genres, genreBadgeOpts{style: "clean"})
	if got := renderGenre(genres, genreBadgeOpts{style: "clean", font: "sans"}); imagesDiffer(def, got) {
		t.Error("clean with sans differs from clean's own face, which is already Liberation Sans Bold")
	}
	for _, fam := range []string{"serif", "mono", "display"} {
		got := renderGenre(genres, genreBadgeOpts{style: "clean", font: fam})
		if inkPixels(got) == 0 {
			t.Errorf("clean + %s drew nothing", fam)
		}
		if !imagesDiffer(def, got) {
			t.Errorf("clean + %s is identical to the clean default", fam)
		}
	}
}

func TestAnUnknownBadgeFontIsTheBuiltInFace(t *testing.T) {
	genres := []string{"Action", "Drama"}
	if imagesDiffer(renderGenre(genres, genreBadgeOpts{}), renderGenre(genres, genreBadgeOpts{font: "comic"})) {
		t.Error("an unknown genre font changed the render")
	}
	if imagesDiffer(renderStrip(""), renderStrip("comic")) {
		t.Error("an unknown rating font changed the render")
	}
}

// A rune the chosen family has no glyph for is drawn by the built-in face, so
// text made only of such runes comes out exactly as it does without a font.
func TestGlyphsMissingFromAFamilyFallBackToTheBuiltInFace(t *testing.T) {
	ensureFaces()
	white := color.NRGBA{R: 255, G: 255, B: 255, A: 255}
	for _, tc := range []struct {
		name string
		text string
		fams []string
	}{
		{"Japanese", "アクション", badgeFontFamilies},
		{"Chinese", "动作", badgeFontFamilies},
		{"Cyrillic under Bebas Neue", "Боевик", []string{"display"}},
	} {
		line := func(face font.Face) *image.NRGBA {
			img := image.NewNRGBA(image.Rect(0, 0, 300, 60))
			drawText(img, face, 10, 40, white, tc.text)
			return img
		}
		wantLabel, wantValue := line(labelFaceFor(1)), line(valueFaceFor(1))
		if inkPixels(wantLabel) == 0 || inkPixels(wantValue) == 0 {
			t.Fatalf("%s: the built-in face drew nothing", tc.name)
		}
		for _, fam := range tc.fams {
			if got := line(labelFaceIn(fam, 1)); imagesDiffer(wantLabel, got) {
				t.Errorf("%s under %s: label fallback does not match the built-in face", tc.name, fam)
			}
			if got := line(valueFaceIn(fam, 1)); imagesDiffer(wantValue, got) {
				t.Errorf("%s under %s: value fallback does not match the built-in face", tc.name, fam)
			}
			if got := renderGenre([]string{tc.text}, genreBadgeOpts{font: fam}); inkPixels(got) == 0 {
				t.Errorf("%s under %s: the genre badge drew nothing", tc.name, fam)
			}
		}
	}
}

func TestMixedScriptLabelUsesBothFaces(t *testing.T) {
	genres := []string{"Drama アニメ"}
	def := renderGenre(genres, genreBadgeOpts{})
	for _, fam := range badgeFontFamilies {
		got := renderGenre(genres, genreBadgeOpts{font: fam})
		if !imagesDiffer(def, got) {
			t.Errorf("%s: the Latin half of a mixed label was not set in the chosen family", fam)
		}
		if inkPixels(got) == 0 {
			t.Errorf("%s: a mixed label drew nothing", fam)
		}
	}
	// The same Latin and non-Latin runes drawn separately must both be present
	// in the mixed render: it is wider than the Latin half alone.
	latin := renderGenre([]string{"Drama"}, genreBadgeOpts{font: "display"})
	mixed := renderGenre(genres, genreBadgeOpts{font: "display"})
	if inkPixels(mixed) <= inkPixels(latin) {
		t.Error("the fallback glyphs added no ink to the mixed label")
	}
}

func TestFallbackFaceDelegatesPerRune(t *testing.T) {
	face := valueFaceIn("display", 1)
	withFace(face, func(f font.Face) {
		if _, ok := f.GlyphAdvance('A'); !ok {
			t.Error("a Latin capital has no glyph in the display face")
		}
		if _, ok := f.GlyphAdvance('日'); !ok {
			// The built-in face lacks it too, so ok is false from both; the
			// advance is still the built-in notdef, never zero.
			if adv, _ := f.GlyphAdvance('日'); adv == 0 {
				t.Error("a rune neither face has drew with no advance, which collapses the label")
			}
		}
	})
}

func TestBadgeFontFacesAreSharedPerScale(t *testing.T) {
	for _, fam := range badgeFontFamilies {
		if valueFaceIn(fam, 1.3) != valueFaceIn(fam, 1.3) {
			t.Errorf("%s: the value face was rebuilt for the same scale", fam)
		}
		if labelFaceIn(fam, 1.3) != labelFaceIn(fam, 1.3) {
			t.Errorf("%s: the label face was rebuilt for the same scale", fam)
		}
	}
}

// Faces are cached and shared between renders; drawing through them from many
// goroutines, including the first build of each, must not race or corrupt.
func TestBadgeFontFacesAreSafeForConcurrentRenders(t *testing.T) {
	families := append([]string{""}, badgeFontFamilies...)
	want := map[string]*image.NRGBA{}
	for _, fam := range families {
		want["genre"+fam] = renderGenre([]string{"Action", "日本語"}, genreBadgeOpts{font: fam})
		want["rating"+fam] = renderStrip(fam)
	}
	var wg sync.WaitGroup
	errs := make(chan string, 256)
	for i := 0; i < 4; i++ {
		for _, fam := range families {
			fam := fam
			wg.Add(1)
			go func() {
				defer wg.Done()
				for j := 0; j < 3; j++ {
					g := renderGenre([]string{"Action", "日本語"}, genreBadgeOpts{font: fam})
					if imagesDiffer(g, want["genre"+fam]) {
						errs <- "genre render changed under concurrency: " + fam
					}
					r := renderStrip(fam)
					if imagesDiffer(r, want["rating"+fam]) {
						errs <- "rating render changed under concurrency: " + fam
					}
				}
			}()
		}
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		t.Error(e)
	}
}

func TestBebasNeueIsCapitalsOnly(t *testing.T) {
	lower := renderGenre([]string{"drama"}, genreBadgeOpts{font: "display", labelCase: "normal"})
	upper := renderGenre([]string{"DRAMA"}, genreBadgeOpts{font: "display", labelCase: "normal"})
	if imagesDiffer(lower, upper) {
		t.Error("the display face drew lower case differently from capitals")
	}
}
