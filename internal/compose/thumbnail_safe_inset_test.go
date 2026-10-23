package compose

import (
	"crypto/sha256"
	"fmt"
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

const thumbW, thumbH = 640, 360

func thumbCanvas() *image.NRGBA { return image.NewNRGBA(image.Rect(0, 0, thumbW, thumbH)) }

// opaqueColumns returns the first and last column holding a painted pixel.
func opaqueColumns(t *testing.T, img *image.NRGBA) (first, last int) {
	t.Helper()
	first, last = -1, -1
	b := img.Bounds()
	for x := b.Min.X; x < b.Max.X; x++ {
		for y := b.Min.Y; y < b.Max.Y; y++ {
			if img.NRGBAAt(x, y).A > 0 {
				if first < 0 {
					first = x
				}
				last = x
				break
			}
		}
	}
	if first < 0 {
		t.Fatal("nothing was drawn")
	}
	return first, last
}

func insetCfg(l imageconfig.RatingsLayout, pct int) imageconfig.Config {
	c := layoutTestConfig(l)
	c.ThumbnailSafeInset = pct
	return c
}

func drawThumb(t *testing.T, mediaType string, cfg imageconfig.Config) *image.NRGBA {
	t.Helper()
	img := thumbCanvas()
	drawBadgesInPlace(mediaType, img, layoutTestRatings(), cfg, titleFacts{})
	return img
}

func TestZeroInsetLeavesThumbnailPixelsAndKeyAlone(t *testing.T) {
	for _, l := range []imageconfig.RatingsLayout{imageconfig.LayoutBottom, imageconfig.LayoutRight, imageconfig.LayoutLeft, imageconfig.LayoutTopBottom} {
		if imagesDiffer(drawThumb(t, "thumbnail", insetCfg(l, 0)), drawThumb(t, "thumbnail", layoutTestConfig(l))) {
			t.Errorf("%s: an inset of 0 moved pixels", l)
		}
	}
	if imageconfig.CacheKey(imageconfig.Parse([]byte(`{"thumbnailSafeInset":0}`))) != imageconfig.CacheKey(imageconfig.Default()) {
		t.Error("an inset of 0 moved the cache key")
	}
}

// Digests of full renders recorded with the inset absent, so a default config
// keeps producing the same bytes on both the poster and the thumbnail.
func TestDefaultRendersArePinnedOnPosterAndThumbnail(t *testing.T) {
	if testing.Short() {
		t.Skip("full renders: skipped under -short")
	}
	want := map[string]string{
		"poster/bottom":        "22cf2ed408791caa960c524b30a5f67b116e5c3cdb193817e6cb3cf37c3b4a7f",
		"poster/right":         "c4de08dd7cf604e3070396b3ae6df03617b76ca676824a92a5c265a90bff7b79",
		"poster/top-bottom":    "34a025b10fb2b0c9f14fca218db1b2f8e25a3541e615cebd0632a5cd26ac4599",
		"thumbnail/bottom":     "aa537daf4239e005be7727331505c217e98c5f2386893e960c5abed1f9ce6806",
		"thumbnail/right":      "bd1305aa20c14b0363cc4ade1766fd9ff10e99fb85b8c73c282df1729f6b9d68",
		"thumbnail/top-bottom": "15ada5aa8987e7806d10b2589c7a73a426c29cbc802cef62450adc118e271240",
	}
	p := effectPipeline()
	for _, s := range []string{"poster", "thumbnail"} {
		for _, l := range []imageconfig.RatingsLayout{imageconfig.LayoutBottom, imageconfig.LayoutRight, imageconfig.LayoutTopBottom} {
			c := maximalConfig()
			c.RatingsLayout = l
			got := fmt.Sprintf("%x", sha256.Sum256(renderOne(t, p, c, "movie", s)))
			if key := fmt.Sprintf("%s/%s", s, l); got != want[key] {
				t.Errorf("%s render changed: %s", key, got)
			}
		}
	}
}

func TestInsetKeepsARightAnchoredBadgeInFromTheEdge(t *testing.T) {
	_, plain := opaqueColumns(t, drawThumb(t, "thumbnail", insetCfg(imageconfig.LayoutRight, 0)))
	_, last := opaqueColumns(t, drawThumb(t, "thumbnail", insetCfg(imageconfig.LayoutRight, 5)))
	if limit := thumbW - thumbW*5/100; last >= limit {
		t.Errorf("rightmost column %d is inside the 5%% band (limit %d)", last, limit)
	}
	if last >= plain {
		t.Errorf("inset did not move the badge: %d vs %d", last, plain)
	}
}

func TestInsetKeepsALeftAnchoredBadgeInFromTheEdge(t *testing.T) {
	first, _ := opaqueColumns(t, drawThumb(t, "thumbnail", insetCfg(imageconfig.LayoutLeft, 22)))
	if limit := thumbW * 22 / 100; first < limit {
		t.Errorf("leftmost column %d is inside the 22%% band (limit %d)", first, limit)
	}
}

func TestInsetIgnoresOtherSurfaces(t *testing.T) {
	if imagesDiffer(drawThumb(t, "poster", insetCfg(imageconfig.LayoutRight, 22)), drawThumb(t, "poster", insetCfg(imageconfig.LayoutRight, 0))) {
		t.Error("the thumbnail inset changed a poster")
	}
}

func TestCentredRowsWorkOnThumbnailsAndStayInsideTheInset(t *testing.T) {
	for _, tc := range []struct {
		layout imageconfig.RatingsLayout
		top    bool
	}{{imageconfig.LayoutTop, true}, {imageconfig.LayoutBottom, false}} {
		img := drawThumb(t, "thumbnail", insetCfg(tc.layout, 0))
		first, last := opaqueColumns(t, img)
		if mid := (first + last) / 2; mid < thumbW/2-4 || mid > thumbW/2+4 {
			t.Errorf("%s row is not centred: columns %d-%d", tc.layout, first, last)
		}
		pb := paintedBoundsOn(img)
		if tc.top && pb.Min.Y > thumbH/4 || !tc.top && pb.Max.Y < thumbH*3/4 {
			t.Errorf("%s row sits at %v", tc.layout, pb)
		}

		// A sideways nudge would carry the row out of the visible middle.
		c := insetCfg(tc.layout, 22)
		c.RatingBadgeOffsetX = 300
		_, last = opaqueColumns(t, drawThumb(t, "thumbnail", c))
		if limit := thumbW - thumbW*22/100; last >= limit {
			t.Errorf("%s nudged row ends at %d, past %d", tc.layout, last, limit)
		}
		c.RatingBadgeOffsetX = -300
		first, _ = opaqueColumns(t, drawThumb(t, "thumbnail", c))
		if limit := thumbW * 22 / 100; first < limit {
			t.Errorf("%s nudged row starts at %d, before %d", tc.layout, first, limit)
		}
	}
}

func paintedBoundsOn(img *image.NRGBA) image.Rectangle {
	out := image.Rectangle{}
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y).A > 0 {
				out = out.Union(image.Rect(x, y, x+1, y+1))
			}
		}
	}
	return out
}

func TestOccupancyInsetClampsCornerAndCentredBoxes(t *testing.T) {
	b := image.Rect(0, 0, thumbW, thumbH)
	inset := thumbW * 22 / 100
	occ := newOccupancy(b).withInsetX(inset)
	tr := occ.placeNudged("tr", 80, 30, 12, 12, 4, 0, 0)
	if tr.Max.X > thumbW-inset {
		t.Errorf("top-right box ends at %d, past %d", tr.Max.X, thumbW-inset)
	}
	bl := occ.placeNudged("bl", 80, 30, 12, 12, 4, -500, 0)
	if bl.Min.X < inset {
		t.Errorf("nudged bottom-left box starts at %d, before %d", bl.Min.X, inset)
	}
	wide := occ.anchor("tc", thumbW, 30, 12, 12, 4)
	if wide.Min.X != inset {
		t.Errorf("a centred box wider than the band starts at %d, want %d", wide.Min.X, inset)
	}
	if got := newOccupancy(b).anchor("tr", 80, 30, 12, 12, 4); got.Max.X != thumbW-12 {
		t.Errorf("without an inset the box moved: %v", got)
	}
}
