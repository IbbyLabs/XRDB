// Package compose implements the image composition pipeline.
// It fetches a source image, resizes it to canonical dimensions, and overlays
// rating badges according to the render config.
package compose

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"sync"
	"time"

	xdraw "golang.org/x/image/draw"

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
	ImageBytes        []byte
	ContentType       string
	CacheKey          string
	FromCache         bool
	ContributingProviders []string // names of providers that returned data
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

const maxImageBytes = 20 * 1024 * 1024 // 20 MiB

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
	lr := &io.LimitedReader{R: resp.Body, N: maxImageBytes + 1}
	var buf bytes.Buffer
	buf.Grow(512 * 1024)
	if _, err = buf.ReadFrom(lr); err != nil {
		return nil, err
	}
	if lr.N == 0 {
		return nil, fmt.Errorf("image fetch: response exceeds %d bytes for %s", maxImageBytes, url)
	}
	return buf.Bytes(), nil
}

// New creates a Pipeline with the given provider registry.
func New(reg *provider.Registry) *Pipeline {
	return &Pipeline{
		providers: reg,
		fetcher:   &httpFetcher{client: &http.Client{Timeout: 15 * time.Second}},
	}
}

// NewWithFetcher creates a Pipeline with a custom image fetcher (for testing).
func NewWithFetcher(reg *provider.Registry, f imageFetcher) *Pipeline {
	return &Pipeline{providers: reg, fetcher: f}
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

	sourceBytes, meta, err := p.fetchSourceImageAndMeta(ctx, req)
	if err != nil || len(sourceBytes) == 0 {
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		return result, nil
	}

	srcImg, err := decodeImage(sourceBytes)
	if err != nil {
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		return result, nil
	}

	resized := resizeFit(srcImg, dim.Width, dim.Height)

	// Convert to NRGBA once — all overlay functions draw in-place.
	composed := toNRGBA(resized)

	allRatings, ratingProviders := p.collectRatingsWithProviders(ctx, req, meta.Ratings)
	result.ContributingProviders = append([]string{string(req.Config.ArtworkSource)}, ratingProviders...)
	if len(allRatings) > 0 && len(req.Config.Ratings) > 0 {
		drawBadgesInPlace(composed, allRatings, req.Config)
	}
	if len(req.Config.Badges) > 0 {
		drawQualityBadges(composed, req.Config.Badges)
	}
	if req.Config.AgeRating && meta.ContentRating != "" {
		drawAgeRatingBadge(composed, meta.ContentRating, req.Config.AgeRatingPos)
	}
	if req.Config.Genre && len(meta.Genres) > 0 {
		drawGenreBadge(composed, meta.Genres, req.Config.GenrePos)
	}
	if req.Config.Providers && len(meta.WatchProviders) > 0 {
		drawProviderBadges(composed, meta.WatchProviders)
	}
	if req.Config.AggregateBar {
		drawAggregateBar(composed, allRatings, req.Config)
	}
	if req.Config.Trending {
		drawTrendingBadge(composed)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, composed); err != nil {
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		return result, nil
	}

	result.ImageBytes = buf.Bytes()
	return result, nil
}

// fetchSourceImageAndMeta fetches the artwork bytes and metadata from the configured provider.
func (p *Pipeline) fetchSourceImageAndMeta(ctx context.Context, req Request) ([]byte, *provider.MediaMeta, error) {
	provName := string(req.Config.ArtworkSource)
	prov := p.providers.Get(provName)
	if prov == nil {
		prov = p.providers.Get("tmdb")
	}
	if prov == nil {
		return nil, nil, fmt.Errorf("no provider available for %q", provName)
	}

	meta, err := prov.Fetch(ctx, req.MediaType, req.MediaID)
	if err != nil {
		return nil, nil, fmt.Errorf("provider fetch: %w", err)
	}

	artworkURL := selectArtworkURL(meta, req.MediaType)
	if artworkURL == "" {
		return nil, meta, fmt.Errorf("no artwork URL in metadata")
	}

	data, err := p.fetcher.Fetch(ctx, artworkURL)
	return data, meta, err
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
	img, err := png.Decode(r)
	if err == nil {
		return img, nil
	}
	_, _ = r.Seek(0, 0)
	return jpeg.Decode(r)
}

// resizeFit scales src to cover maxW×maxH using bilinear interpolation,
// then center-crops to exact dimensions.
func resizeFit(src image.Image, maxW, maxH int) image.Image {
	srcB := src.Bounds()
	srcW, srcH := srcB.Dx(), srcB.Dy()
	if srcW == 0 || srcH == 0 {
		return image.NewNRGBA(image.Rect(0, 0, maxW, maxH))
	}

	scaleX := float64(maxW) / float64(srcW)
	scaleY := float64(maxH) / float64(srcH)
	scale := scaleX
	if scaleY > scaleX {
		scale = scaleY
	}

	scaledW := int(float64(srcW)*scale + 0.5)
	scaledH := int(float64(srcH)*scale + 0.5)
	if scaledW < maxW {
		scaledW = maxW
	}
	if scaledH < maxH {
		scaledH = maxH
	}

	scaled := image.NewNRGBA(image.Rect(0, 0, scaledW, scaledH))
	xdraw.BiLinear.Scale(scaled, scaled.Bounds(), src, srcB, xdraw.Over, nil)

	offsetX := (scaledW - maxW) / 2
	offsetY := (scaledH - maxH) / 2
	dst := image.NewNRGBA(image.Rect(0, 0, maxW, maxH))
	draw.Draw(dst, dst.Bounds(), scaled, image.Pt(offsetX, offsetY), draw.Src)
	return dst
}

// collectRatings calls all non-artwork providers in parallel and merges their ratings
// with those already returned by the artwork source. Duplicate sources are deduplicated.
func (p *Pipeline) collectRatings(ctx context.Context, req Request, artworkRatings []provider.Rating) []provider.Rating {
	ratings, _ := p.collectRatingsWithProviders(ctx, req, artworkRatings)
	return ratings
}

// collectRatingsWithProviders is like collectRatings but also returns the
// names of every non-artwork provider that returned data (for TTL selection).
func (p *Pipeline) collectRatingsWithProviders(ctx context.Context, req Request, artworkRatings []provider.Rating) ([]provider.Rating, []string) {
	all := make([]provider.Rating, len(artworkRatings))
	copy(all, artworkRatings)
	seen := make(map[string]bool, len(all))
	for _, r := range all {
		seen[r.Source] = true
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	var contributors []string
	artworkSource := string(req.Config.ArtworkSource)
	for _, name := range p.providers.Names() {
		if name == artworkSource {
			continue
		}
		prov := p.providers.Get(name)
		if prov == nil {
			continue
		}
		wg.Add(1)
		go func(prov provider.Provider) {
			defer wg.Done()
			meta, err := prov.Fetch(ctx, req.MediaType, req.MediaID)
			if err != nil || meta == nil {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			contributed := false
			for _, r := range meta.Ratings {
				if !seen[r.Source] {
					seen[r.Source] = true
					all = append(all, r)
					contributed = true
				}
			}
			if contributed {
				contributors = append(contributors, prov.Name())
			}
		}(prov)
	}
	wg.Wait()
	return all, contributors
}

// toNRGBA converts any image.Image to *image.NRGBA for in-place drawing.
// If src is already *image.NRGBA, it is returned as-is.
func toNRGBA(src image.Image) *image.NRGBA {
	if dst, ok := src.(*image.NRGBA); ok {
		return dst
	}
	bounds := src.Bounds()
	dst := image.NewNRGBA(bounds)
	draw.Draw(dst, bounds, src, bounds.Min, draw.Src)
	return dst
}

func buildCacheKey(req Request) string {
	cfgKey := imageconfig.CacheKey(req.Config)
	return render.CacheKey(req.MediaType, req.MediaID, cfgKey)
}
