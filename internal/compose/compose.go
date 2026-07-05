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
	_ "image/jpeg" // register JPEG decoding
	"image/png"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // register WebP decoding (metahub serves WebP)

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

// Request is the input to the composition pipeline.
type Request struct {
	MediaType string // artwork surface: poster|backdrop|thumbnail|logo
	// ContentType is the title kind ("movie"|"series"), distinct from the
	// artwork surface. It is what rating providers need to query the right
	// endpoint. May be empty when the caller doesn't know it, in which case
	// providers self-resolve (try movie, fall back to series).
	ContentType string
	MediaID     string // media identifier (IMDB tt-ID or TMDB numeric ID)
	Config      imageconfig.Config
}

// Result holds the composed image bytes and metadata.
type Result struct {
	ImageBytes            []byte
	ContentType           string
	CacheKey              string
	FromCache             bool
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

// TMDBClient returns the registered TMDB provider, or nil. The media
// search/trending/lookup endpoints are TMDB-backed.
func (p *Pipeline) TMDBClient() *provider.TMDB {
	t, _ := p.providers.Get("tmdb").(*provider.TMDB)
	return t
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
	dim := render.DimensionsForSize(req.MediaType, string(req.Config.Size))
	cacheKey := buildCacheKey(req)
	result := &Result{
		CacheKey:    cacheKey,
		ContentType: "image/png",
	}

	sourceBytes, meta, ratingID, err := p.fetchSourceImageAndMeta(ctx, req)
	if err != nil || len(sourceBytes) == 0 {
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		return result, nil
	}

	srcImg, err := decodeImage(sourceBytes)
	if err != nil {
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		return result, nil
	}

	// Collect ratings up front so the logo letterbox can reserve a clear band
	// for the rating strip beneath the wordmark. ratingID differs from
	// req.MediaID for episodes, so per-episode ratings resolve correctly.
	ratingReq := req
	ratingReq.MediaID = ratingID
	allRatings, ratingProviders := p.collectRatingsWithProviders(ctx, ratingReq, meta.Ratings)
	result.ContributingProviders = append([]string{string(req.Config.ArtworkSource)}, ratingProviders...)

	// Use saliency-aware cropping when a backdrop is the source so that
	// off-centre subjects are not clipped by a naive centre crop.
	usesBackdrop := req.MediaType == "backdrop" ||
		(req.MediaType == "poster" && req.Config.BackdropAsPoster) ||
		req.MediaType == "thumbnail"
	var resized image.Image
	switch {
	case usesBackdrop:
		resized = resizeFitSmart(srcImg, dim.Width, dim.Height)
	case req.MediaType == "logo":
		// Letterbox the logo above a clear band reserved for the rating strip so
		// rating/age overlays sit beneath the wordmark instead of cropping it.
		// The logo is still letterboxed, never cover-cropped.
		logoH := dim.Height
		if band := ratingsBandHeight(dim.Width, allRatings, req.Config); band > 0 {
			if maxBand := dim.Height / 2; band > maxBand {
				band = maxBand
			}
			logoH = dim.Height - band
		}
		boxed := resizeContain(srcImg, dim.Width, logoH)
		canvas := image.NewNRGBA(image.Rect(0, 0, dim.Width, dim.Height))
		draw.Draw(canvas, image.Rect(0, 0, dim.Width, logoH), boxed, image.Point{}, draw.Src)
		resized = canvas
	default:
		resized = resizeFit(srcImg, dim.Width, dim.Height)
	}

	// Convert to NRGBA once — all overlay functions draw in-place.
	composed := toNRGBA(resized)

	scale := outputScale(req.Config.Size)

	// occ tracks regions claimed by overlays so corner-anchored badges and the
	// average-rating ring are placed without overlapping one another or, on the
	// logo media type, the wordmark itself.
	occ := newOccupancy(composed.Bounds())
	if req.MediaType == "logo" {
		// Reserve the wordmark's content box so no overlay draws over the title.
		occ.reserve(nonTransparentBounds(composed))
	}

	var ratingsH int
	if len(allRatings) > 0 && len(req.Config.Ratings) > 0 {
		ratingsH = drawBadgesInPlace(composed, allRatings, req.Config)
		if ratingsH > 0 {
			// Reserve the full-width band the ratings strip occupies so corner
			// overlays (notably the ring) float clear of it.
			b := composed.Bounds()
			band := int(20*scale + 0.5)
			switch req.Config.RatingsLayout {
			case imageconfig.LayoutTop:
				occ.reserve(image.Rect(b.Min.X, b.Min.Y, b.Max.X, b.Min.Y+ratingsH+band))
			case imageconfig.LayoutSplitSide:
				// Side-anchored: corner overlays rarely conflict — left unreserved.
			default:
				occ.reserve(image.Rect(b.Min.X, b.Max.Y-ratingsH-band, b.Max.X, b.Max.Y))
			}
		}
	}
	if len(req.Config.Badges) > 0 {
		drawQualityBadges(composed, req.Config.Badges, scale, occ)
	}
	if req.Config.AgeRating && meta.ContentRating != "" {
		drawAgeRatingBadge(composed, meta.ContentRating, req.Config.AgeRatingPos, scale, occ)
	}
	if req.Config.Genre && len(meta.Genres) > 0 {
		drawGenreBadge(composed, meta.Genres, req.Config.GenrePos, scale, occ)
	}
	if req.Config.Providers && len(meta.WatchProviders) > 0 {
		drawProviderBadges(composed, meta.WatchProviders, scale, occ)
	}
	if req.Config.AggregateBar {
		drawAggregateBar(composed, allRatings, req.Config)
	}
	if req.Config.Trending {
		drawTrendingBadgeStyled(composed, scale, occ, trendingStyleFromConfig(req.Config.TrendingStyle))
	}
	if req.Config.RatingRing {
		drawAverageRatingRing(composed, allRatings, req.Config, scale, occ)
	}
	// Show the logo overlay when explicitly requested OR when the user has
	// chosen to use the backdrop as a poster (backdrop images don't carry
	// baked-in title text, so the overlay is the only way to show the title).
	// Auto-enable the logo overlay only when an actual backdrop is in use.
	// If BackdropURL is empty the pipeline falls back to poster artwork (which
	// already carries baked-in title text), so adding a logo overlay there would
	// double-stamp the title.
	//
	// "Clean" artwork is the textless base with the title logo composited back
	// on top — that logo overlay is exactly what distinguishes it from plain
	// "textless", which leaves the art bare. (Not on the logo surface, whose
	// base image is already the wordmark.)
	wantsLogoOverlay := req.Config.BackdropLogo ||
		(req.Config.TextPreference == imageconfig.TextClean && req.MediaType != "logo") ||
		(req.MediaType == "poster" && req.Config.BackdropAsPoster && meta.BackdropURL != "")
	if wantsLogoOverlay && meta.LogoURL != "" {
		if logoBytes, err := p.fetcher.Fetch(ctx, meta.LogoURL); err == nil {
			drawBackdropLogoOverlay(composed, logoBytes, ratingsH)
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, composed); err != nil {
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		return result, nil
	}

	result.ImageBytes = buf.Bytes()
	return result, nil
}

// parseEpisodeID detects an episode identifier of the form
// "<series>:<season>:<episode>" — the Stremio/AIOMetadata format for series
// episodes, where <series> may be an IMDb tt-id, "tmdb:<id>", or a bare numeric
// TMDB id (e.g. "tt0903747:1:1", "tmdb:1396:1:1"). Anime episode schemes
// (kitsu:/mal:) are left to their own providers and not matched here.
func parseEpisodeID(id string) (series string, season, episode int, ok bool) {
	parts := strings.Split(id, ":")
	if len(parts) < 3 {
		return "", 0, 0, false
	}
	e, err1 := strconv.Atoi(parts[len(parts)-1])
	s, err2 := strconv.Atoi(parts[len(parts)-2])
	if err1 != nil || err2 != nil {
		return "", 0, 0, false
	}
	series = strings.Join(parts[:len(parts)-2], ":")
	// TMDB seasons can be 0 (specials); episodes are 1-based.
	if series == "" || s < 0 || e < 1 {
		return "", 0, 0, false
	}
	return series, s, e, true
}

// fetchEpisode resolves per-episode artwork and ratings for a series episode.
// It returns the episode still bytes, a meta seeded with TMDB's episode rating,
// and the id under which the remaining rating providers should be queried (the
// episode's own IMDb tconst when known, so their ratings are per-episode too).
// handled is false when this isn't resolvable as an episode, so the caller
// falls back to normal series-level artwork.
func (p *Pipeline) fetchEpisode(ctx context.Context, req Request, series string, season, episode int) ([]byte, *provider.MediaMeta, string, bool) {
	tmdb := p.TMDBClient()
	if tmdb == nil {
		return nil, nil, "", false
	}
	seriesID := strings.TrimPrefix(series, "tmdb:")
	info, err := tmdb.FetchEpisode(ctx, seriesID, season, episode, provider.ArtworkOptions{
		Language: req.Config.Language,
		Size:     string(req.Config.Size),
	})
	if err != nil || info == nil || info.StillURL == "" {
		return nil, nil, "", false
	}
	data, err := p.fetcher.Fetch(ctx, info.StillURL)
	if err != nil || len(data) == 0 {
		return nil, nil, "", false
	}
	meta := &provider.MediaMeta{}
	if info.Rating != nil {
		meta.Ratings = []provider.Rating{*info.Rating}
	}
	ratingID := req.MediaID
	if info.IMDbID != "" {
		ratingID = info.IMDbID
	}
	return data, meta, ratingID, true
}

// fetchSourceImageAndMeta fetches the artwork bytes and metadata from the
// configured provider. The returned string is the id under which ratings
// should be collected — normally req.MediaID, but the episode's own IMDb tconst
// for a series-episode request so ratings resolve per-episode.
func (p *Pipeline) fetchSourceImageAndMeta(ctx context.Context, req Request) ([]byte, *provider.MediaMeta, string, error) {
	// Series-episode requests (thumbnails from AIOMetadata) resolve the episode
	// still + per-episode ratings instead of the series-level artwork.
	if series, season, episode, ok := parseEpisodeID(req.MediaID); ok {
		if data, meta, ratingID, handled := p.fetchEpisode(ctx, req, series, season, episode); handled {
			return data, meta, ratingID, nil
		}
	}
	opts := provider.ArtworkOptions{
		Language:       req.Config.Language,
		TextPreference: string(req.Config.TextPreference),
		Size:           string(req.Config.Size),
	}
	// Try the configured artwork source first, then fall back across the other
	// image-capable providers so a surface missing from one source (most often a
	// logo) is filled from wherever it exists. baseMeta keeps the first
	// provider's metadata for overlays, backfilling image URLs it lacked.
	var baseMeta *provider.MediaMeta
	for _, name := range p.artworkOrder(string(req.Config.ArtworkSource)) {
		prov := p.providers.Get(name)
		if prov == nil {
			continue
		}
		var meta *provider.MediaMeta
		var err error
		// Providers are queried by content type (movie/series), never by the
		// artwork surface; the surface only decides which image URL we pick.
		if af, ok := prov.(provider.ArtworkFetcher); ok {
			meta, err = af.FetchArtwork(ctx, req.ContentType, req.MediaID, opts)
		} else {
			meta, err = prov.Fetch(ctx, req.ContentType, req.MediaID)
		}
		if err != nil || meta == nil {
			continue
		}
		if baseMeta == nil {
			baseMeta = meta
		} else {
			mergeArtworkURLs(baseMeta, meta)
		}
		// Strict per-surface selection: no logo→poster substitution yet, so the
		// loop keeps trying other providers for a real logo first.
		if url := selectSurfaceURL(meta, req.MediaType, req.Config); url != "" {
			if data, ferr := p.fetcher.Fetch(ctx, url); ferr == nil && len(data) > 0 {
				p.enrichMetaForOverlays(ctx, req, baseMeta)
				return data, baseMeta, req.MediaID, nil
			}
		}
	}
	if baseMeta == nil {
		return nil, nil, req.MediaID, fmt.Errorf("no artwork provider returned metadata")
	}
	// No provider had the exact surface. Last resort allows a poster to stand in
	// for a missing logo/thumbnail, using art merged from every source tried.
	p.enrichMetaForOverlays(ctx, req, baseMeta)
	if url := selectArtworkURL(baseMeta, req.MediaType, req.Config); url != "" {
		if data, err := p.fetcher.Fetch(ctx, url); err == nil && len(data) > 0 {
			return data, baseMeta, req.MediaID, nil
		}
	}
	return nil, baseMeta, req.MediaID, fmt.Errorf("no artwork URL in metadata")
}

// artworkOrder lists providers to try for artwork: the configured source first,
// then the remaining image-capable providers as fallbacks. Providers not
// registered (e.g. Fanart without an API key) are skipped by the caller.
func (p *Pipeline) artworkOrder(primary string) []string {
	order := make([]string, 0, 4)
	if primary != "" {
		order = append(order, primary)
	}
	for _, name := range []string{"fanart", "tmdb", "cinemeta"} {
		if name != primary {
			order = append(order, name)
		}
	}
	return order
}

// selectSurfaceURL returns the provider's own image for the requested surface,
// WITHOUT the logo→poster substitution selectArtworkURL applies — so the
// fallback loop exhausts every provider for a real logo before settling.
func selectSurfaceURL(meta *provider.MediaMeta, surface string, cfg imageconfig.Config) string {
	switch surface {
	case "backdrop":
		return meta.BackdropURL
	case "thumbnail":
		if meta.BackdropURL != "" {
			return meta.BackdropURL
		}
		return meta.PosterURL
	case "logo":
		return meta.LogoURL
	default: // poster
		if cfg.BackdropAsPoster && meta.BackdropURL != "" {
			return meta.BackdropURL
		}
		return meta.PosterURL
	}
}

// mergeArtworkURLs backfills image URLs missing from dst with those from src, so
// overlays (e.g. the clean-artwork logo) can use art discovered on a fallback
// provider even when the base source lacked it.
func mergeArtworkURLs(dst, src *provider.MediaMeta) {
	if dst.PosterURL == "" {
		dst.PosterURL = src.PosterURL
	}
	if dst.BackdropURL == "" {
		dst.BackdropURL = src.BackdropURL
	}
	if dst.LogoURL == "" {
		dst.LogoURL = src.LogoURL
	}
}

// enrichMetaForOverlays fills overlay metadata (content rating, genres, watch
// providers) from TMDB when the artwork source doesn't supply it. Without this,
// switching artwork to fanart/cinemeta would silently drop the age/genre/
// provider badges even though the data exists.
func (p *Pipeline) enrichMetaForOverlays(ctx context.Context, req Request, meta *provider.MediaMeta) {
	needsRating := req.Config.AgeRating && meta.ContentRating == ""
	needsGenres := req.Config.Genre && len(meta.Genres) == 0
	needsProviders := req.Config.Providers && len(meta.WatchProviders) == 0
	if !needsRating && !needsGenres && !needsProviders {
		return
	}
	tmdb := p.providers.Get("tmdb")
	if tmdb == nil || tmdb.Name() == string(req.Config.ArtworkSource) {
		return
	}
	extra, err := tmdb.Fetch(ctx, req.ContentType, req.MediaID)
	if err != nil || extra == nil {
		return
	}
	if needsRating {
		meta.ContentRating = extra.ContentRating
	}
	if needsGenres {
		meta.Genres = extra.Genres
	}
	if needsProviders {
		meta.WatchProviders = extra.WatchProviders
	}
}

func selectArtworkURL(meta *provider.MediaMeta, mediaType string, cfg imageconfig.Config) string {
	switch mediaType {
	case "backdrop":
		return meta.BackdropURL
	case "thumbnail":
		// Thumbnails are 16:9 — wide backdrop art crops correctly; a 2:3
		// poster center-cropped into that frame loses heads and titles.
		if meta.BackdropURL != "" {
			return meta.BackdropURL
		}
		return meta.PosterURL
	case "logo":
		if meta.LogoURL != "" {
			return meta.LogoURL
		}
		return meta.PosterURL
	default: // poster
		if cfg.BackdropAsPoster && meta.BackdropURL != "" {
			// Use the backdrop center-cropped to poster dimensions.
			// resizeFit already handles the cover-and-crop, so no extra work here.
			return meta.BackdropURL
		}
		return meta.PosterURL
	}
}

// decodeImage decodes PNG, JPEG, or WebP bytes into an image.Image.
func decodeImage(data []byte) (image.Image, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	return img, err
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
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), src, srcB, xdraw.Over, nil)

	offsetX := (scaledW - maxW) / 2
	offsetY := (scaledH - maxH) / 2
	dst := image.NewNRGBA(image.Rect(0, 0, maxW, maxH))
	draw.Draw(dst, dst.Bounds(), scaled, image.Pt(offsetX, offsetY), draw.Src)
	return dst
}

// collectRatingsWithProviders calls all non-artwork providers in parallel and
// merges their ratings with those already returned by the artwork source.
// Duplicate sources are deduplicated. Also returns the names of every
// non-artwork provider that returned data (for TTL selection).
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
			meta, err := prov.Fetch(ctx, req.ContentType, req.MediaID)
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
