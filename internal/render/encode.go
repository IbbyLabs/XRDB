package render

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"

	xdraw "golang.org/x/image/draw"
)

// Format is the wire encoding for a delivered render.
type Format string

const (
	// FormatAuto picks PNG for surfaces that need transparency and JPEG for
	// the rest.
	FormatAuto Format = "auto"
	FormatJPEG Format = "jpeg"
	FormatPNG  Format = "png"
)

// DefaultQuality is the JPEG quality used when a config does not set one.
// At the default poster delivery size this lands around 65 KB, inside
// Stremio's 100 KB meta-poster limit with room to spare.
const DefaultQuality = 82

const (
	MIMEJPEG = "image/jpeg"
	MIMEPNG  = "image/png"
)

// needsAlpha lists the surfaces whose output must keep transparency. A logo is
// a wordmark composited over whatever sits behind it, so flattening it onto an
// opaque background would put a box around the title.
var needsAlpha = map[string]bool{"logo": true}

// deliverySmall holds the delivered dimensions for the "small" tier, keyed by
// media type. Only the poster is listed: Stremio caps meta posters at 100 KB
// (50 KB recommended) while backgrounds are allowed 500 KB and fit at full
// size, so shrinking anything else would cost quality for no gain.
var deliverySmall = map[string]Dimensions{
	"poster": {Width: 342, Height: 513},
}

// DeliveryFor returns the dimensions actually sent to the client for a media
// type at the requested size tier. This is distinct from DimensionsForSize,
// which gives the canvas the pipeline composes on: the small tier renders at
// the full canvas and downsamples, so badge text stays crisp instead of being
// drawn at a size where hinting falls apart.
func DeliveryFor(mediaType, size string) Dimensions {
	if size == "small" {
		if d, ok := deliverySmall[mediaType]; ok {
			return d
		}
	}
	return DimensionsForSize(mediaType, size)
}

// ResolveFormat maps a requested format onto a concrete one for a media type.
// An unrecognized value is treated as auto rather than rejected, so an older
// profile carrying a format this build does not know still renders.
func ResolveFormat(f Format, mediaType string) Format {
	switch f {
	case FormatJPEG:
		// A surface that needs alpha can't be served as JPEG whatever the
		// config says, so honour the requirement over the request.
		if needsAlpha[mediaType] {
			return FormatPNG
		}
		return FormatJPEG
	case FormatPNG:
		return FormatPNG
	default:
		if needsAlpha[mediaType] {
			return FormatPNG
		}
		return FormatJPEG
	}
}

// Encode downsamples img to the delivery size for mediaType/size when it is
// larger, then encodes it. It returns the encoded bytes and the matching
// content type.
func Encode(img image.Image, mediaType, size string, format Format, quality int) ([]byte, string, error) {
	out := Downsample(img, DeliveryFor(mediaType, size))

	switch ResolveFormat(format, mediaType) {
	case FormatPNG:
		var buf bytes.Buffer
		if err := png.Encode(&buf, out); err != nil {
			return nil, "", fmt.Errorf("encode png: %w", err)
		}
		return buf.Bytes(), MIMEPNG, nil
	default:
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, out, &jpeg.Options{Quality: normalizeQuality(quality)}); err != nil {
			return nil, "", fmt.Errorf("encode jpeg: %w", err)
		}
		return buf.Bytes(), MIMEJPEG, nil
	}
}

// normalizeQuality clamps a JPEG quality into the useful range. Zero means
// "unset" and takes the default rather than encoding an unreadable image.
func normalizeQuality(q int) int {
	if q <= 0 {
		return DefaultQuality
	}
	if q < 40 {
		return 40
	}
	if q > 100 {
		return 100
	}
	return q
}

// Downsample scales img down to fit within target, preserving its aspect
// ratio. Images already at or below the target are returned untouched, so the
// larger size tiers cost nothing. Upscaling is never done: it would only add
// bytes without adding detail.
func Downsample(img image.Image, target Dimensions) image.Image {
	b := img.Bounds()
	if target.Width <= 0 || target.Height <= 0 {
		return img
	}
	if b.Dx() <= target.Width && b.Dy() <= target.Height {
		return img
	}
	w, h := fitWithin(b.Dx(), b.Dy(), target.Width, target.Height)
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	// CatmullRom is the sharpest of the x/image kernels and this runs once per
	// render behind the cache, so the extra cost over bilinear is not on a hot
	// path.
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, b, xdraw.Over, nil)
	return dst
}

// fitWithin returns the largest width/height with the same aspect ratio as
// srcW/srcH that fits inside maxW/maxH.
func fitWithin(srcW, srcH, maxW, maxH int) (int, int) {
	scale := float64(maxW) / float64(srcW)
	if s := float64(maxH) / float64(srcH); s < scale {
		scale = s
	}
	w := int(float64(srcW)*scale + 0.5)
	h := int(float64(srcH)*scale + 0.5)
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}
	return w, h
}

// SniffContentType reports the content type of already-encoded image bytes.
// The render cache stores payloads without a format marker, so an entry
// written by an earlier build (or under a different format setting) is
// identified from its magic bytes rather than assumed.
func SniffContentType(data []byte) string {
	switch {
	case len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF:
		return MIMEJPEG
	default:
		return MIMEPNG
	}
}
