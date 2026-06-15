package compose

import (
	"bytes"
	"image"
	"image/color"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"sync"
	"time"
)

const tmdbLogoBase = "https://image.tmdb.org/t/p/w92"

var (
	logoCache  sync.Map // logo_path → *image.NRGBA (nil = known error)
	logoClient = &http.Client{Timeout: 3 * time.Second}
)

// fetchProviderLogo downloads and caches a TMDB provider logo by its path.
// Returns nil on any error so callers fall back to text rendering.
func fetchProviderLogo(logoPath string) *image.NRGBA {
	if logoPath == "" {
		return nil
	}
	if v, ok := logoCache.Load(logoPath); ok {
		if v == nil {
			return nil
		}
		return v.(*image.NRGBA)
	}

	resp, err := logoClient.Get(tmdbLogoBase + logoPath)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		logoCache.Store(logoPath, nil)
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logoCache.Store(logoPath, nil)
		return nil
	}

	src, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		logoCache.Store(logoPath, nil)
		return nil
	}

	nrgba := imageToNRGBA(src)
	logoCache.Store(logoPath, nrgba)
	return nrgba
}

// imageToNRGBA converts any image.Image to *image.NRGBA with pre-multiplied
// alpha un-done (NRGBA stores straight alpha).
func imageToNRGBA(src image.Image) *image.NRGBA {
	b := src.Bounds()
	dst := image.NewNRGBA(b)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r32, g32, b32, a32 := src.At(x, y).RGBA()
			if a32 == 0 {
				continue
			}
			dst.SetNRGBA(x, y, color.NRGBA{
				R: uint8(r32 * 255 / a32),
				G: uint8(g32 * 255 / a32),
				B: uint8(b32 * 255 / a32),
				A: uint8(a32 >> 8),
			})
		}
	}
	return dst
}
