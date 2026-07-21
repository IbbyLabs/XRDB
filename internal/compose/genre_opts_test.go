package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func genreTestImage() *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, 400, 600))
	return img
}

func imagesDiffer(a, b *image.NRGBA) bool {
	if len(a.Pix) != len(b.Pix) {
		return true
	}
	for i := range a.Pix {
		if a.Pix[i] != b.Pix[i] {
			return true
		}
	}
	return false
}

// An offset must move the badge; a scale must resize it; a background opacity
// must change its fill — each observable as a different rendered image.
func TestGenreBadgeOptsChangeRender(t *testing.T) {
	genres := []string{"Action", "Drama"}

	base := genreTestImage()
	drawGenreBadge(base, genres, "bl", 1.0, newOccupancy(base.Bounds()), genreBadgeOpts{})

	cases := map[string]genreBadgeOpts{
		"offset":  {offsetX: 40, offsetY: -30},
		"scale":   {scalePercent: 180},
		"opacity": {bgOpacity: 40},
	}
	for name, opts := range cases {
		img := genreTestImage()
		drawGenreBadge(img, genres, "bl", 1.0, newOccupancy(img.Bounds()), opts)
		if !imagesDiffer(base, img) {
			t.Errorf("%s opts did not change the rendered badge", name)
		}
	}
}

// genreOptsFromConfig must map the config fields through unchanged.
func TestGenreOptsFromConfig(t *testing.T) {
	cfg := imageconfig.Parse([]byte(`{"genreBadgeScale":150,"genreBadgeOffsetX":10,"genreBadgeOffsetY":-5,"genreBadgeBackgroundOpacity":60}`))
	opts := genreOptsFromConfig(cfg)
	if opts.scalePercent != 150 || opts.offsetX != 10 || opts.offsetY != -5 || opts.bgOpacity != 60 {
		t.Errorf("opts mismatch: %+v", opts)
	}
}

func TestQualityAndTrendingOptsChangeRender(t *testing.T) {
	base := genreTestImage()
	drawQualityBadges(base, []string{"4k", "hdr"}, 1.0, newOccupancy(base.Bounds()), qualityBadgeOpts{})

	for name, opts := range map[string]qualityBadgeOpts{
		"pos":    {pos: "bl"},
		"scale":  {scalePercent: 160},
		"offset": {offsetX: 30, offsetY: 20},
	} {
		img := genreTestImage()
		drawQualityBadges(img, []string{"4k", "hdr"}, 1.0, newOccupancy(img.Bounds()), opts)
		if !imagesDiffer(base, img) {
			t.Errorf("quality %s opts did not change the render", name)
		}
	}

	// Trending at a different position must move the badge.
	tl := genreTestImage()
	drawTrendingBadgeStyled(tl, 1.0, newOccupancy(tl.Bounds()), trendingArrowWord, "", "")
	br := genreTestImage()
	drawTrendingBadgeStyled(br, 1.0, newOccupancy(br.Bounds()), trendingArrowWord, "br", "")
	if !imagesDiffer(tl, br) {
		t.Error("trending position did not change the render")
	}
}

func TestQualityMaxCapsCount(t *testing.T) {
	two := 2
	img := genreTestImage()
	n := drawQualityBadges(img, []string{"4k", "hdr", "dv", "atmos"}, 1.0, newOccupancy(img.Bounds()), qualityBadgeOpts{max: &two})
	if n != 2 {
		t.Errorf("expected max to cap at 2, drew %d", n)
	}
}

func TestRatingScaleAndAggregateColorChangeRender(t *testing.T) {
	ratings := []provider.Rating{
		{Source: "imdb", Value: 8.5, Label: "8.5"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
	}
	base := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}, RatingsLayout: imageconfig.LayoutBottom}

	img1 := genreTestImage()
	drawBadgesInPlace(img1, ratings, base)
	scaled := base
	scaled.RatingBadgeScale = 170
	img2 := genreTestImage()
	drawBadgesInPlace(img2, ratings, scaled)
	if !imagesDiffer(img1, img2) {
		t.Error("rating badge scale did not change the render")
	}

	// Aggregate bar: a custom accent color must change the fill.
	aggBase := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}, AggregateBar: true, AggregateBarPos: "bottom"}
	a1 := genreTestImage()
	drawAggregateBar(a1, ratings, aggBase)
	aggColor := aggBase
	aggColor.AggregateAccentColor = "#3355ff"
	a2 := genreTestImage()
	drawAggregateBar(a2, ratings, aggColor)
	if !imagesDiffer(a1, a2) {
		t.Error("aggregate accent color did not change the render")
	}
}

func TestRatingsMaxCapsBadges(t *testing.T) {
	ratings := []provider.Rating{
		{Source: "imdb", Value: 8.5, Label: "8.5"},
		{Source: "tmdb", Value: 7.9, Label: "7.9"},
		{Source: "rt", Value: 9.0, Label: "90%"},
	}
	one := 1
	capped := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt"}, RatingsLayout: imageconfig.LayoutBottom, RatingBadgeConfig: imageconfig.RatingBadgeConfig{RatingsMax: &one}}
	full := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt"}, RatingsLayout: imageconfig.LayoutBottom}
	imgCap := genreTestImage()
	hCap := drawBadgesInPlace(imgCap, ratings, capped)
	imgFull := genreTestImage()
	hFull := drawBadgesInPlace(imgFull, ratings, full)
	if hCap == 0 || hFull == 0 {
		t.Fatal("expected both to draw a strip")
	}
	if !imagesDiffer(imgCap, imgFull) {
		t.Error("ratingsMax cap did not change the render")
	}
}

func TestGenreBadgeStylesChangeRender(t *testing.T) {
	genres := []string{"Action", "Drama"}
	def := genreTestImage()
	drawGenreBadge(def, genres, "bl", 2.0, newOccupancy(def.Bounds()), genreBadgeOpts{})

	for name, opts := range map[string]genreBadgeOpts{
		"plain": {style: "plain"},
		"tile":  {style: "tile", tileColor: "#3355ff"},
	} {
		img := genreTestImage()
		drawGenreBadge(img, genres, "bl", 2.0, newOccupancy(img.Bounds()), opts)
		if !imagesDiffer(def, img) {
			t.Errorf("genre style %q did not change the render", name)
		}
	}
}

func TestQualityBadgeStylesChangeRender(t *testing.T) {
	toks := []string{"4k", "hdr"}
	def := genreTestImage()
	drawQualityBadges(def, toks, 2.0, newOccupancy(def.Bounds()), qualityBadgeOpts{})
	for name, opts := range map[string]qualityBadgeOpts{
		"plain": {style: "plain"},
		"tile":  {style: "tile", tileColor: "#3355ff"},
	} {
		img := genreTestImage()
		drawQualityBadges(img, toks, 2.0, newOccupancy(img.Bounds()), opts)
		if !imagesDiffer(def, img) {
			t.Errorf("quality style %q did not change the render", name)
		}
	}
}

func TestAgeRatingStylesChangeRender(t *testing.T) {
	def := genreTestImage()
	drawAgeRatingBadge(def, "TV-MA", "br", 2.0, newOccupancy(def.Bounds()), ageRatingOpts{})
	for name, opts := range map[string]ageRatingOpts{
		"plain":  {style: "plain"},
		"tile":   {style: "tile", tileColor: "#c0392b"},
		"square": {style: "square"},
		"media":  {style: "media"},
		"silver": {style: "silver"},
	} {
		img := genreTestImage()
		drawAgeRatingBadge(img, "TV-MA", "br", 2.0, newOccupancy(img.Bounds()), opts)
		if !imagesDiffer(def, img) {
			t.Errorf("age style %q did not change the render", name)
		}
	}
}

func TestScorebarBandColorsAndThresholds(t *testing.T) {
	ratings := []provider.Rating{{Source: "imdb", Value: 6.5, Label: "6.5"}}
	base := imageconfig.Config{Ratings: []string{"imdb"}, AggregateBar: true, AggregateBarPos: "bottom"}

	def := genreTestImage()
	drawAggregateBar(def, ratings, base)

	// A custom mid-band color must change the fill for a mid score (6.5 in [5,8)).
	midColor := base
	midColor.ScorebarMidColor = "#8b5cf6"
	m := genreTestImage()
	drawAggregateBar(m, ratings, midColor)
	if !imagesDiffer(def, m) {
		t.Error("scorebar mid color did not change the render")
	}

	// Moving the high threshold below 6.5 promotes it to the high band → green.
	thr := base
	thr.ScorebarHighThreshold = 6.0
	tImg := genreTestImage()
	drawAggregateBar(tImg, ratings, thr)
	if !imagesDiffer(def, tImg) {
		t.Error("scorebar threshold change did not change the band")
	}
}

func TestTrendingTextColorChangesRender(t *testing.T) {
	def := genreTestImage()
	drawTrendingBadgeStyled(def, 2.0, newOccupancy(def.Bounds()), trendingArrowWord, "", "")
	col := genreTestImage()
	drawTrendingBadgeStyled(col, 2.0, newOccupancy(col.Bounds()), trendingArrowWord, "", "#00ffcc")
	if !imagesDiffer(def, col) {
		t.Error("trending text color did not change the render")
	}
}

func TestRingCenterOpacityChangesRender(t *testing.T) {
	ratings := []provider.Rating{{Source: "imdb", Value: 8.0, Label: "8.0"}}
	base := imageconfig.Config{Ratings: []string{"imdb"}, RatingRing: true, RatingRingPos: "br"}
	def := genreTestImage()
	drawAverageRatingRing(def, ratings, base, 2.0, newOccupancy(def.Bounds()))
	op := base
	op.RingCenterOpacity = 40
	img := genreTestImage()
	drawAverageRatingRing(img, ratings, op, 2.0, newOccupancy(img.Bounds()))
	if !imagesDiffer(def, img) {
		t.Error("ring center opacity did not change the render")
	}
}

func TestRatingBadgeOffsetChangesRender(t *testing.T) {
	ratings := []provider.Rating{{Source: "imdb", Value: 8.5, Label: "8.5"}, {Source: "tmdb", Value: 7.9, Label: "7.9"}}
	base := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}, RatingsLayout: imageconfig.LayoutBottom}
	def := genreTestImage()
	drawBadgesInPlace(def, ratings, base)
	off := base
	off.RatingBadgeOffsetX = -40
	off.RatingBadgeOffsetY = -50
	img := genreTestImage()
	drawBadgesInPlace(img, ratings, off)
	if !imagesDiffer(def, img) {
		t.Error("rating badge offset did not change the render")
	}
}

func TestRingValueProgressSources(t *testing.T) {
	ratings := []provider.Rating{
		{Source: "imdb", Value: 9.5, Label: "9.5"},
		{Source: "tmdb", Value: 5.0, Label: "5.0"},
	}
	base := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}, RatingRing: true, RatingRingPos: "br"}
	def := genreTestImage()
	drawAverageRatingRing(def, ratings, base, 2.0, newOccupancy(def.Bounds()))

	// Value from imdb (9.5) vs the average (7.25) must render a different number.
	valSrc := base
	valSrc.RingValueSource = "imdb"
	img := genreTestImage()
	drawAverageRatingRing(img, ratings, valSrc, 2.0, newOccupancy(img.Bounds()))
	if !imagesDiffer(def, img) {
		t.Error("ring value source did not change the render")
	}

	// Unknown source falls back to the average (no change).
	unk := base
	unk.RingValueSource = "nonesuch"
	img2 := genreTestImage()
	drawAverageRatingRing(img2, ratings, unk, 2.0, newOccupancy(img2.Bounds()))
	if imagesDiffer(def, img2) {
		t.Error("unknown ring source should fall back to the average")
	}
}

func TestEditorialPresentationRenders(t *testing.T) {
	ratings := []provider.Rating{{Source: "imdb", Value: 8.5, Label: "8.5"}, {Source: "tmdb", Value: 7.9, Label: "7.9"}}
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}}
	img := genreTestImage()
	drawEditorialRating(img, ratings, []string{"Crime"}, cfg, 2.0, newOccupancy(img.Bounds()))
	// Editorial draws (non-empty) and differs from the standard strip.
	std := genreTestImage()
	drawBadgesInPlace(std, ratings, imageconfig.Config{Ratings: []string{"imdb", "tmdb"}, RatingsLayout: imageconfig.LayoutBottom})
	if !imagesDiffer(img, std) {
		t.Error("editorial presentation matched the standard strip")
	}
	blank := genreTestImage()
	if !imagesDiffer(img, blank) {
		t.Error("editorial presentation drew nothing")
	}
}

func TestProviderAccentOverrideChangesRender(t *testing.T) {
	ratings := []provider.Rating{{Source: "imdb", Value: 8.5, Label: "8.5"}}
	base := imageconfig.Config{Ratings: []string{"imdb"}, RatingsLayout: imageconfig.LayoutBottom}
	def := genreTestImage()
	drawBadgesInPlace(def, ratings, base)
	ov := base
	ov.RatingProviderOverrides = map[string]string{"imdb": "#8b5cf6"}
	img := genreTestImage()
	drawBadgesInPlace(img, ratings, ov)
	if !imagesDiffer(def, img) {
		t.Error("provider accent override did not change the render")
	}
}
