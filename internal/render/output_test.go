package render

import (
	"bytes"
	"image/png"
	"testing"
)

func TestIsValidMediaType(t *testing.T) {
	for _, v := range []string{"poster", "backdrop", "thumbnail", "logo"} {
		if !IsValidMediaType(v) {
			t.Errorf("expected %q to be valid", v)
		}
	}
	for _, v := range []string{"", "unknown", "image", "POSTER"} {
		if IsValidMediaType(v) {
			t.Errorf("expected %q to be invalid", v)
		}
	}
}

func TestDimensionsFor(t *testing.T) {
	cases := []struct{ mediaType string; w, h int }{
		{"poster", 580, 859},
		{"backdrop", 1280, 720},
		{"thumbnail", 320, 180},
		{"logo", 800, 200},
		{"unknown", 580, 859},
	}
	for _, tc := range cases {
		d := DimensionsFor(tc.mediaType)
		if d.Width != tc.w || d.Height != tc.h {
			t.Errorf("DimensionsFor(%q): got %dx%d, want %dx%d", tc.mediaType, d.Width, d.Height, tc.w, tc.h)
		}
	}
}

func TestPlaceholderPNGReturnsBytesForAllTypes(t *testing.T) {
	for _, mt := range []string{"poster", "backdrop", "thumbnail", "logo"} {
		if len(PlaceholderPNG(mt)) == 0 {
			t.Errorf("PlaceholderPNG(%q): got empty bytes", mt)
		}
	}
}

func TestPlaceholderPNGIsDeterministic(t *testing.T) {
	for _, mt := range []string{"poster", "backdrop", "thumbnail", "logo"} {
		if !bytes.Equal(PlaceholderPNG(mt), PlaceholderPNG(mt)) {
			t.Errorf("PlaceholderPNG(%q): non-deterministic output", mt)
		}
	}
}

func TestPlaceholderPNGDecodesWithCorrectDimensions(t *testing.T) {
	cases := []struct{ mediaType string; w, h int }{
		{"poster", 580, 859},
		{"backdrop", 1280, 720},
		{"thumbnail", 320, 180},
		{"logo", 800, 200},
	}
	for _, tc := range cases {
		img, err := png.Decode(bytes.NewReader(PlaceholderPNG(tc.mediaType)))
		if err != nil {
			t.Errorf("PlaceholderPNG(%q): decode error: %v", tc.mediaType, err)
			continue
		}
		b := img.Bounds()
		if b.Dx() != tc.w || b.Dy() != tc.h {
			t.Errorf("PlaceholderPNG(%q): decoded %dx%d, want %dx%d", tc.mediaType, b.Dx(), b.Dy(), tc.w, tc.h)
		}
	}
}

func TestPlaceholderPNGUnknownFallsBackToPoster(t *testing.T) {
	if !bytes.Equal(PlaceholderPNG("unknown"), PlaceholderPNG("poster")) {
		t.Error("expected unknown type to fall back to poster bytes")
	}
}

func TestPlaceholderPNGTypesAreDifferent(t *testing.T) {
	types := []string{"poster", "backdrop", "thumbnail", "logo"}
	seen := make(map[string][]byte, len(types))
	for _, mt := range types {
		seen[mt] = PlaceholderPNG(mt)
	}
	for i, a := range types {
		for j, b := range types {
			if i >= j {
				continue
			}
			if bytes.Equal(seen[a], seen[b]) {
				t.Errorf("PlaceholderPNG(%q) and PlaceholderPNG(%q) produced identical bytes", a, b)
			}
		}
	}
}

func TestDimensionsForSize(t *testing.T) {
	cases := []struct {
		mediaType, size string
		wantW, wantH    int
	}{
		{"poster", "normal", 580, 859},
		{"poster", "large", 870, 1289},
		{"poster", "4k", 1740, 2577},
		{"backdrop", "4k", 3840, 2160},
		{"thumbnail", "large", 480, 270},
		{"poster", "bogus", 580, 859},
	}
	for _, tc := range cases {
		d := DimensionsForSize(tc.mediaType, tc.size)
		if d.Width != tc.wantW || d.Height != tc.wantH {
			t.Errorf("DimensionsForSize(%q,%q) = %dx%d, want %dx%d",
				tc.mediaType, tc.size, d.Width, d.Height, tc.wantW, tc.wantH)
		}
	}
}
