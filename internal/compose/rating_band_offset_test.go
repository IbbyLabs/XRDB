package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// The ratings strip is drawn at a computed y that carries its vertical offset.
// The band reserved for it must carry the same offset, or a corner overlay
// avoids where the strip is not and can be drawn across where it is.
func TestTheRatingBandFollowsTheStripOffset(t *testing.T) {
	frame := image.Rect(0, 0, 600, 900)
	const h, band = 60, 20

	unmoved := ratingBands(frame, h, band, 0, imageconfig.LayoutBottom)
	lifted := ratingBands(frame, h, band, -110, imageconfig.LayoutBottom)
	if len(unmoved) != 1 || len(lifted) != 1 {
		t.Fatalf("a bottom strip reserves one band, got %d and %d", len(unmoved), len(lifted))
	}
	if got := lifted[0].Min.Y - unmoved[0].Min.Y; got != -110 {
		t.Errorf("lifting the strip by 110 moved its band by %d; the band and the strip disagree", got)
	}

	// Both edges move together on a top-bottom layout, since both strips carry
	// the same offset.
	tb := ratingBands(frame, h, band, -40, imageconfig.LayoutTopBottom)
	base := ratingBands(frame, h, band, 0, imageconfig.LayoutTopBottom)
	if len(tb) != 2 || len(base) != 2 {
		t.Fatalf("top-bottom reserves two bands, got %d and %d", len(tb), len(base))
	}
	for i := range tb {
		if got := tb[i].Min.Y - base[i].Min.Y; got != -40 {
			t.Errorf("band %d moved by %d, expected -40", i, got)
		}
	}
}

// The fix must not touch a strip that sets no offset.
func TestAnUnoffsetRatingBandIsUnchanged(t *testing.T) {
	frame := image.Rect(0, 0, 600, 900)
	const h, band = 60, 20
	for _, layout := range []imageconfig.RatingsLayout{
		imageconfig.LayoutBottom, imageconfig.LayoutTop, imageconfig.LayoutTopBottom,
	} {
		bands := ratingBands(frame, h, band, 0, layout)
		var want []image.Rectangle
		top := image.Rect(0, 0, 600, h+band)
		bottom := image.Rect(0, 900-h-band, 600, 900)
		switch layout {
		case imageconfig.LayoutTop:
			want = []image.Rectangle{top}
		case imageconfig.LayoutTopBottom:
			want = []image.Rectangle{top, bottom}
		default:
			want = []image.Rectangle{bottom}
		}
		if len(bands) != len(want) {
			t.Fatalf("%s: got %d bands, want %d", layout, len(bands), len(want))
		}
		for i := range want {
			if bands[i] != want[i] {
				t.Errorf("%s band %d is %v at offset 0, expected %v", layout, i, bands[i], want[i])
			}
		}
	}
}

// Side layouts stay unreserved, as before.
func TestSideRatingLayoutsReserveNoBand(t *testing.T) {
	frame := image.Rect(0, 0, 600, 900)
	for _, layout := range []imageconfig.RatingsLayout{
		imageconfig.LayoutLeft, imageconfig.LayoutRight, imageconfig.LayoutSplitSide,
	} {
		if b := ratingBands(frame, 60, 20, -50, layout); b != nil {
			t.Errorf("%s reserved %v, expected nothing", layout, b)
		}
	}
}
