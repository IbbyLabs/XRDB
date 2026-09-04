package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// Large and 4k fetch TMDB's original upload, so the width is whatever was
// uploaded and the tier's assumed growth can be absent. BUG-285: badges were
// scaled by the tier regardless, so a small original got oversized overlays.
func TestFrameScaleSizesFromTheDeliveredWidth(t *testing.T) {
	for _, tc := range []struct {
		name      string
		mediaType string
		frameW    int
		size      imageconfig.MediaSize
		want      float64
	}{
		{"backdrop 4k, original no bigger than normal", "backdrop", 1280, imageconfig.Size4K, 1},
		{"backdrop 4k, original genuinely large", "backdrop", 3840, imageconfig.Size4K, 3},
		{"backdrop 4k, original between the two", "backdrop", 2560, imageconfig.Size4K, 2},
		{"logo 4k, the canvas is letterboxed to the tier", "logo", 2400, imageconfig.Size4K, 3},
		{"logo 4k, a canvas that did not grow", "logo", 800, imageconfig.Size4K, 1},
		{"poster large, original no bigger than normal", "poster", 780, imageconfig.SizeLarge, 1},
		{"poster large, original past the tier", "poster", 1560, imageconfig.SizeLarge, 1.5},
		{"normal is untouched", "backdrop", 1280, imageconfig.SizeNormal, 1},
		{"normal is untouched even when the upload is small", "backdrop", 640, imageconfig.SizeNormal, 1},
		{"an unknown surface keeps the tier", "sticker", 100, imageconfig.Size4K, 3},
		{"an unmeasured frame keeps the tier", "backdrop", 0, imageconfig.Size4K, 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := frameScale(tc.mediaType, tc.frameW, tc.size); got != tc.want {
				t.Errorf("frameScale(%q, %d, %q) = %v, want %v",
					tc.mediaType, tc.frameW, tc.size, got, tc.want)
			}
		})
	}
}

// The tier is a ceiling, never a floor: a delivered width past what the tier
// asked for does not grow the overlays beyond it.
func TestFrameScaleNeverExceedsTheTier(t *testing.T) {
	for _, size := range []imageconfig.MediaSize{
		imageconfig.SizeSmall, imageconfig.SizeNormal,
		imageconfig.SizeLarge, imageconfig.Size4K,
	} {
		tier := outputScale(size)
		for _, w := range []int{0, 640, 780, 1280, 3840, 7680} {
			if got := frameScale("backdrop", w, size); got > tier {
				t.Errorf("frameScale(backdrop, %d, %q) = %v, above tier %v", w, size, got, tier)
			}
		}
	}
}
