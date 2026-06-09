// Package compose implements the image composition pipeline.
// It fetches a source image, resizes it to canonical dimensions, and overlays
// rating badges according to the render config.
package compose

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"net/http"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

// Request is the input to the composition pipeline.
type Request struct {
	MediaType string // poster|backdrop|thumbnail|logo
	MediaID   string // media identifier (IMDB tt-ID or TMDB numeric ID)
	Config    imageconfig.Config
}

// Result holds the composed image bytes and metadata.
type Result struct {
	ImageBytes  []byte
	ContentType string
	CacheKey    string
	FromCache   bool
}

// Pipeline orchestrates metadata fetch + image composition.
type Pipeline struct {
	providers *provider.Registry
	fetcher   imageFetcher
}

// imageFetcher abstracts HTTP image retrieval for testing.
type imageFetcher interface {
	Fetch(ctx context.Context, url string) ([]byte, error)
}

// httpFetcher is the production imageFetcher.
type httpFetcher struct {
	client *http.Client
}

func (f *httpFetcher) Fetch(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("image fetch: http %d for %s", resp.StatusCode, url)
	}
	var buf bytes.Buffer
	buf.Grow(512 * 1024)
	_, err = buf.ReadFrom(resp.Body)
	return buf.Bytes(), err
}

// New creates a Pipeline with the given provider registry.
func New(reg *provider.Registry) *Pipeline {
	return &Pipeline{
		providers: reg,
		fetcher:   &httpFetcher{client: &http.Client{Timeout: 15 * time.Second}},
	}
}

// Render executes the composition pipeline for the given request.
// Falls back to a type-colored placeholder if any step fails.
func (p *Pipeline) Render(ctx context.Context, req Request) (*Result, error) {
	dim := render.DimensionsFor(req.MediaType)
	cacheKey := buildCacheKey(req)
	result := &Result{
		CacheKey:    cacheKey,
		ContentType: "image/png",
	}

	// Attempt to fetch source image via primary provider
	sourceBytes, err := p.fetchSourceImage(ctx, req)
	if err != nil || len(sourceBytes) == 0 {
		// Fall back to placeholder
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		return result, nil
	}

	// Decode source image
	srcImg, err := decodeImage(sourceBytes)
	if err != nil {
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		return result, nil
	}

	// Resize to canonical dimensions
	resized := resizeFit(srcImg, dim.Width, dim.Height)

	// Compose ratings overlay
	composed := composeRatings(resized, req)

	// Encode as PNG
	var buf bytes.Buffer
	if err := png.Encode(&buf, composed); err != nil {
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		return result, nil
	}
	result.ImageBytes = buf.Bytes()
	return result, nil
}

// fetchSourceImage attempts to get the artwork URL from the first available provider.
func (p *Pipeline) fetchSourceImage(ctx context.Context, req Request) ([]byte, error) {
	provName := string(req.Config.ArtworkSource)
	prov := p.providers.Get(provName)
	if prov == nil {
		prov = p.providers.Get("tmdb")
	}
	if prov == nil {
		return nil, fmt.Errorf("no provider available for %q", provName)
	}

	meta, err := prov.Fetch(ctx, req.MediaType, req.MediaID)
	if err != nil {
		return nil, fmt.Errorf("provider fetch: %w", err)
	}

	artworkURL := selectArtworkURL(meta, req.MediaType)
	if artworkURL == "" {
		return nil, fmt.Errorf("no artwork URL in metadata")
	}

	return p.fetcher.Fetch(ctx, artworkURL)
}

func selectArtworkURL(meta *provider.MediaMeta, mediaType string) string {
	switch mediaType {
	case "backdrop":
		return meta.BackdropURL
	case "logo":
		if meta.LogoURL != "" {
			return meta.LogoURL
		}
		return meta.PosterURL
	default: // poster, thumbnail
		return meta.PosterURL
	}
}

// decodeImage decodes JPEG or PNG bytes into an image.Image.
func decodeImage(data []byte) (image.Image, error) {
	r := bytes.NewReader(data)
	// Try PNG first, then JPEG
	img, err := png.Decode(r)
	if err == nil {
		return img, nil
	}
	r.Seek(0, 0)
	return jpeg.Decode(r)
}

// resizeFit scales img to fit within maxW×maxH using nearest-neighbor resampling,
// maintaining aspect ratio and cropping to fill exact dimensions.
func resizeFit(src image.Image, maxW, maxH int) image.Image {
	srcB := src.Bounds()
	srcW := srcB.Dx()
	srcH := srcB.Dy()

	if srcW == 0 || srcH == 0 {
		return image.NewNRGBA(image.Rect(0, 0, maxW, maxH))
	}

	// Scale to cover (crop to fill)
	scaleX := float64(maxW) / float64(srcW)
	scaleY := float64(maxH) / float64(srcH)
	scale := scaleX
	if scaleY > scaleX {
		scale = scaleY
	}

	scaledW := int(float64(srcW) * scale)
	scaledH := int(float64(srcH) * scale)

	// Center-crop
	offsetX := (scaledW - maxW) / 2
	offsetY := (scaledH - maxH) / 2

	dst := image.NewNRGBA(image.Rect(0, 0, maxW, maxH))
	for dy := 0; dy < maxH; dy++ {
		for dx := 0; dx < maxW; dx++ {
			sx := int(float64(dx+offsetX) / scale)
			sy := int(float64(dy+offsetY) / scale)
			if sx < srcB.Min.X {
				sx = srcB.Min.X
			} else if sx >= srcB.Max.X {
				sx = srcB.Max.X - 1
			}
			if sy < srcB.Min.Y {
				sy = srcB.Min.Y
			} else if sy >= srcB.Max.Y {
				sy = srcB.Max.Y - 1
			}
			dst.Set(dx, dy, src.At(sx, sy))
		}
	}
	return dst
}

// composeRatings draws a semi-transparent ratings bar onto the image.
func composeRatings(base image.Image, req Request) image.Image {
	if len(req.Config.Ratings) == 0 {
		return base
	}

	bounds := base.Bounds()
	out := image.NewNRGBA(bounds)
	draw.Draw(out, bounds, base, bounds.Min, draw.Src)

	// Draw a semi-transparent bar at the bottom (or top per layout)
	barH := bounds.Dy() / 8
	if barH < 20 {
		barH = 20
	}
	barY := bounds.Max.Y - barH
	if req.Config.RatingsLayout == imageconfig.LayoutTop {
		barY = 0
	}
	barColor := color.NRGBA{R: 0, G: 0, B: 0, A: 180}
	barRect := image.Rect(bounds.Min.X, barY, bounds.Max.X, barY+barH)
	draw.Draw(out, barRect, &image.Uniform{C: barColor}, image.Point{}, draw.Over)

	return out
}

func buildCacheKey(req Request) string {
	cfgKey := imageconfig.CacheKey(req.Config)
	return render.CacheKey(req.MediaType, req.MediaID, cfgKey)
}
