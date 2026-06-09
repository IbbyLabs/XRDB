package render

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
)

// Dimensions holds the canonical pixel dimensions for a media type.
type Dimensions struct {
	Width  int
	Height int
}

var validMediaTypes = map[string]struct{}{
	"poster":    {},
	"backdrop":  {},
	"thumbnail": {},
	"logo":      {},
}

// IsValidMediaType reports whether t is a recognized output family.
func IsValidMediaType(t string) bool {
	_, ok := validMediaTypes[t]
	return ok
}

// DimensionsFor returns the canonical output dimensions for a media type.
// Unknown types fall back to poster dimensions.
func DimensionsFor(mediaType string) Dimensions {
	switch mediaType {
	case "backdrop":
		return Dimensions{1280, 720}
	case "thumbnail":
		return Dimensions{320, 180}
	case "logo":
		return Dimensions{800, 200}
	default:
		return Dimensions{580, 859}
	}
}

// placeholderColors are the type-specific fill colors for placeholder PNG output.
var placeholderColors = map[string]color.NRGBA{
	"poster":    {R: 30, G: 30, B: 50, A: 255},
	"backdrop":  {R: 20, G: 40, B: 30, A: 255},
	"thumbnail": {R: 40, G: 20, B: 40, A: 255},
	"logo":      {R: 50, G: 40, B: 20, A: 255},
}

// placeholderPNGs holds pre-built PNG bytes indexed by media type.
// Generated once at package init; safe for concurrent read access.
var placeholderPNGs map[string][]byte

func init() {
	placeholderPNGs = make(map[string][]byte, len(placeholderColors))
	for t, c := range placeholderColors {
		dim := DimensionsFor(t)
		img := image.NewNRGBA(image.Rect(0, 0, dim.Width, dim.Height))
		draw.Draw(img, img.Bounds(), &image.Uniform{C: c}, image.Point{}, draw.Src)
		var buf bytes.Buffer
		_ = png.Encode(&buf, img)
		placeholderPNGs[t] = buf.Bytes()
	}
}

// PlaceholderPNG returns pre-generated placeholder PNG bytes for the given media type.
// The returned slice must not be modified. Unknown types fall back to poster.
func PlaceholderPNG(mediaType string) []byte {
	if b, ok := placeholderPNGs[mediaType]; ok {
		return b
	}
	return placeholderPNGs["poster"]
}
