package render

import (
	"bytes"
	"image"
	"image/color"
	"testing"
)

func noisyImage(w, h int) image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			v := uint32(x*2654435761) ^ uint32(y*2246822519)
			img.SetNRGBA(x, y, color.NRGBA{uint8(v >> 3), uint8(v >> 11), uint8(v >> 19), 255})
		}
	}
	return img
}

func TestDeliveryForSmallShrinksOnlyThePoster(t *testing.T) {
	poster := DeliveryFor("poster", "small")
	if poster.Width != 342 || poster.Height != 513 {
		t.Errorf("small poster = %dx%d, want 342x513", poster.Width, poster.Height)
	}
	// Backgrounds get a 500 KB budget in Stremio and fit at full size, so the
	// small tier must leave them alone.
	for _, mt := range []string{"backdrop", "thumbnail", "logo"} {
		if got, want := DeliveryFor(mt, "small"), DimensionsForSize(mt, "normal"); got != want {
			t.Errorf("small %s = %v, want %v (unchanged)", mt, got, want)
		}
	}
}

func TestDeliveryForLargerTiersIsUnchanged(t *testing.T) {
	for _, size := range []string{"normal", "large", "4k"} {
		if got, want := DeliveryFor("poster", size), DimensionsForSize("poster", size); got != want {
			t.Errorf("poster %s = %v, want %v", size, got, want)
		}
	}
}

func TestEncodeDefaultPosterFitsStremioLimit(t *testing.T) {
	data, ct, err := Encode(noisyImage(780, 1170), "poster", "small", FormatAuto, 0)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	if ct != MIMEJPEG {
		t.Errorf("content type = %q, want %q", ct, MIMEJPEG)
	}
	if len(data) >= 100*1024 {
		t.Errorf("poster is %d bytes, must stay under Stremio's 100 KB limit", len(data))
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if b := img.Bounds(); b.Dx() != 342 || b.Dy() != 513 {
		t.Errorf("delivered %dx%d, want 342x513", b.Dx(), b.Dy())
	}
}

func TestEncodeKeepsLogoAsPNGEvenWhenJPEGIsRequested(t *testing.T) {
	_, ct, err := Encode(noisyImage(800, 200), "logo", "small", FormatJPEG, 0)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	if ct != MIMEPNG {
		t.Errorf("content type = %q, want %q — a logo needs its alpha channel", ct, MIMEPNG)
	}
}

func TestEncodeHonoursAnExplicitPNGRequest(t *testing.T) {
	_, ct, err := Encode(noisyImage(100, 100), "poster", "small", FormatPNG, 0)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	if ct != MIMEPNG {
		t.Errorf("content type = %q, want %q", ct, MIMEPNG)
	}
}

func TestEncodeUnknownFormatFallsBackToAuto(t *testing.T) {
	_, ct, err := Encode(noisyImage(100, 100), "poster", "small", Format("avif"), 0)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	if ct != MIMEJPEG {
		t.Errorf("content type = %q, want %q", ct, MIMEJPEG)
	}
}

func TestHigherQualityProducesMoreBytes(t *testing.T) {
	src := noisyImage(780, 1170)
	low, _, err := Encode(src, "poster", "small", FormatJPEG, 50)
	if err != nil {
		t.Fatalf("Encode low: %v", err)
	}
	high, _, err := Encode(src, "poster", "small", FormatJPEG, 95)
	if err != nil {
		t.Fatalf("Encode high: %v", err)
	}
	if len(high) <= len(low) {
		t.Errorf("q95 produced %d bytes, q50 produced %d — quality is not being applied", len(high), len(low))
	}
}

func TestNormalizeQualityClamps(t *testing.T) {
	for _, tc := range []struct{ in, want int }{
		{0, DefaultQuality}, {-5, DefaultQuality}, {10, 40}, {80, 80}, {200, 100},
	} {
		if got := normalizeQuality(tc.in); got != tc.want {
			t.Errorf("normalizeQuality(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestDownsampleNeverUpscales(t *testing.T) {
	src := noisyImage(100, 150)
	out := Downsample(src, Dimensions{Width: 800, Height: 1200})
	if b := out.Bounds(); b.Dx() != 100 || b.Dy() != 150 {
		t.Errorf("got %dx%d, want the source untouched at 100x150", b.Dx(), b.Dy())
	}
}

func TestDownsamplePreservesAspectRatio(t *testing.T) {
	out := Downsample(noisyImage(1000, 500), Dimensions{Width: 100, Height: 100})
	b := out.Bounds()
	if b.Dx() != 100 || b.Dy() != 50 {
		t.Errorf("got %dx%d, want 100x50", b.Dx(), b.Dy())
	}
}

func TestSniffContentType(t *testing.T) {
	jpegBytes, _, err := Encode(noisyImage(50, 50), "poster", "small", FormatJPEG, 0)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	if got := SniffContentType(jpegBytes); got != MIMEJPEG {
		t.Errorf("sniffed %q, want %q", got, MIMEJPEG)
	}
	// A cache entry written by an earlier build is PNG and must still be
	// identified correctly rather than served as JPEG.
	if got := SniffContentType(PlaceholderPNG("poster")); got != MIMEPNG {
		t.Errorf("sniffed %q, want %q", got, MIMEPNG)
	}
	if got := SniffContentType(nil); got != MIMEPNG {
		t.Errorf("sniffed empty as %q, want %q", got, MIMEPNG)
	}
}
