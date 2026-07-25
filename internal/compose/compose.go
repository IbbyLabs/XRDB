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
	_ "image/jpeg" // register JPEG decoding
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // register WebP decoding (metahub serves WebP)

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/provider/animemap"
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
	ContributingProviders []string // names of providers that returned data
	// Placeholder is true when ImageBytes is a fallback placeholder rather than
	// real artwork — the caller must not cache it (a transient failure would
	// otherwise be frozen for the whole TTL) and should signal that downstream.
	Placeholder bool
}

// Pipeline orchestrates metadata fetch + image composition.
type Pipeline struct {
	providers *provider.Registry
	fetcher   imageFetcher
	logger    *slog.Logger
	// anime resolves whether a title is a known anime, so the genre badge can
	// tell anime apart from animation generally. Optional: nil disables it.
	anime animeResolver
	// health remembers the last good result per source so a degraded source
	// falls back instead of vanishing. Optional: nil disables the fallback.
	health *provider.HealthTracker
}

// animeResolver reports whether a media ID belongs to a known anime. Satisfied
// by *animemap.Mapper, which answers from an in-memory index with no network
// call on the render path.
type animeResolver interface {
	Resolve(ctx context.Context, mediaType, id string) (animemap.IDs, bool)
}

// SetAnimeResolver attaches the anime ID mapper.
func (p *Pipeline) SetAnimeResolver(r animeResolver) { p.anime = r }

// isAnimeTitle reports whether the requested title is a known anime.
func (p *Pipeline) isAnimeTitle(ctx context.Context, req Request) bool {
	if p.anime == nil {
		return false
	}
	_, ok := p.anime.Resolve(ctx, req.MediaType, req.MediaID)
	return ok
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

// Provider returns the registered provider by name, or nil. Used to push
// UI-saved credentials into a live provider without a restart.
func (p *Pipeline) Provider(name string) provider.Provider {
	return p.providers.Get(name)
}

// providerReady reports whether a credential-gated provider is currently
// configured. Keyless public providers (which do not implement HasCredentials)
// are always ready. This lets the render path register every keyed provider up
// front and simply skip the ones without a key, so a key saved at runtime
// activates its provider without a restart or re-registration.
func providerReady(p provider.Provider) bool {
	if hc, ok := p.(interface{ HasCredentials() bool }); ok {
		return hc.HasCredentials()
	}
	return true
}

// providerWanted reports whether a provider is worth calling for this config.
// A provider that declares its rating sources is skipped when none of them were
// selected, which keeps a source that costs a site lookup from being fetched on
// every render just to be discarded. Providers that declare nothing are always
// called, as they were before.
func providerWanted(p provider.Provider, selected []string) bool {
	sourcer, ok := p.(provider.RatingSourcer)
	if !ok {
		return true
	}
	for _, source := range sourcer.RatingSources() {
		for _, want := range selected {
			if source == want {
				return true
			}
		}
	}
	return false
}

// fetchRatings asks a provider for ratings the way that provider can be asked:
// by id for most, by title for the ones with no id-based lookup.
func (p *Pipeline) fetchRatings(ctx context.Context, prov provider.Provider, req Request, artwork *provider.MediaMeta) (*provider.MediaMeta, error) {
	byTitle, ok := prov.(provider.TitleRatingProvider)
	if !ok {
		return prov.Fetch(ctx, req.ContentType, req.MediaID)
	}
	return byTitle.FetchByTitle(ctx, req.ContentType, artwork.Title, artwork.OriginalTitle, artwork.Year)
}

// SetHealthTracker attaches the source-health tracker. Optional: without one
// the pipeline behaves as it did before, dropping a failed source silently.
func (p *Pipeline) SetHealthTracker(h *provider.HealthTracker) { p.health = h }

// Health returns the attached tracker, or nil.
func (p *Pipeline) Health() *provider.HealthTracker { return p.health }

// fetchRatingsResilient wraps fetchRatings with the last-known-good fallback.
//
// Two failure shapes matter and neither used to leave a trace. A hard error is
// the obvious one. The quieter one is a success carrying no ratings, which is
// what a scraped source produces the day its markup changes; treating that as a
// real answer is what silently erased a badge from every render. Both fall back
// to the previous good answer for the same title when one is remembered.
func (p *Pipeline) fetchRatingsResilient(ctx context.Context, prov provider.Provider, req Request, artwork *provider.MediaMeta) (*provider.MediaMeta, error) {
	meta, err := p.fetchRatings(ctx, prov, req, artwork)
	if p.health == nil {
		return meta, err
	}
	key := provider.GoodKey(prov.Name(), req.ContentType, req.MediaID)

	if err == nil && meta != nil && len(meta.Ratings) > 0 {
		p.health.Success(prov.Name(), key, meta)
		return meta, nil
	}
	if err != nil {
		p.health.Failure(prov.Name(), err)
	}
	if good, ok := p.health.LastGood(prov.Name(), key); ok {
		p.log().WarnContext(ctx, "A ratings source is degraded; serving its last known good result",
			"id", logging.RequestID(ctx), "source", prov.Name(),
			"media_id", req.MediaID, "error", err)
		return good, nil
	}
	if err == nil && meta != nil && len(meta.Ratings) == 0 {
		// Nothing remembered and nothing returned. Record it so a source that
		// starts answering empty still shows up as unhealthy.
		p.health.Success(prov.Name(), key, meta)
	}
	return meta, err
}

// New creates a Pipeline with the given provider registry.
func New(reg *provider.Registry) *Pipeline {
	return &Pipeline{
		providers: reg,
		fetcher:   &httpFetcher{client: &http.Client{Timeout: 15 * time.Second}},
		logger:    slog.Default(),
	}
}

// NewWithFetcher creates a Pipeline with a custom image fetcher (for testing).
func NewWithFetcher(reg *provider.Registry, f imageFetcher) *Pipeline {
	return &Pipeline{providers: reg, fetcher: f, logger: slog.Default()}
}

// log returns the pipeline logger, falling back to the slog default so a
// Pipeline built without one (e.g. a struct literal in a test) never panics.
func (p *Pipeline) log() *slog.Logger {
	if p.logger == nil {
		return slog.Default()
	}
	return p.logger
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
		p.log().WarnContext(ctx, "No source artwork was available; serving a placeholder",
			"id", logging.RequestID(ctx),
			"media_type", req.MediaType, "media_id", req.MediaID,
			"artwork_source", string(req.Config.ArtworkSource), "error", err)
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		result.Placeholder = true
		return result, nil
	}

	srcImg, err := decodeImage(sourceBytes)
	if err != nil {
		p.log().WarnContext(ctx, "The source artwork could not be decoded; serving a placeholder",
			"id", logging.RequestID(ctx),
			"media_type", req.MediaType, "media_id", req.MediaID,
			"bytes", len(sourceBytes), "error", err)
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		result.Placeholder = true
		return result, nil
	}

	// Collect ratings up front so the logo letterbox can reserve a clear band
	// for the rating strip beneath the wordmark. ratingID differs from
	// req.MediaID for episodes, so per-episode ratings resolve correctly.
	ratingReq := req
	ratingReq.MediaID = ratingID
	allRatings, ratingProviders := p.collectRatingsWithProviders(ctx, ratingReq, meta)
	result.ContributingProviders = append([]string{string(req.Config.ArtworkSource)}, ratingProviders...)
	meta.IsAnime = p.isAnimeTitle(ctx, req)

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
		if band := ratingsBandHeight(dim.Width, dim.Height, allRatings, req.Config); band > 0 {
			if maxBand := dim.Height / 2; band > maxBand {
				band = maxBand
			}
			logoH = dim.Height - band
		}
		boxed := resizeContain(srcImg, dim.Width, logoH)
		canvas := image.NewNRGBA(image.Rect(0, 0, dim.Width, dim.Height))
		// A "dark" logo background fills the otherwise-transparent canvas with an
		// opaque dark panel, so a light wordmark reads on a pale surface behind it.
		if req.Config.LogoBackground == "dark" {
			draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.NRGBA{R: 18, G: 20, B: 26, A: 255}}, image.Point{}, draw.Src)
		}
		draw.Draw(canvas, image.Rect(0, 0, dim.Width, logoH), boxed, image.Point{}, draw.Over)
		resized = canvas
	default:
		resized = resizeFit(srcImg, dim.Width, dim.Height)
	}

	// Convert to NRGBA once — all overlay functions draw in-place.
	composed := toNRGBA(resized)

	scale := overlayScale(outputScale(req.Config.Size), composed.Bounds().Dy())

	// occ tracks regions claimed by overlays so corner-anchored badges and the
	// average-rating ring are placed without overlapping one another or, on the
	// logo media type, the wordmark itself.
	occ := newOccupancy(composed.Bounds())
	if req.MediaType == "logo" {
		// Reserve the wordmark's content box so no overlay draws over the title.
		occ.reserve(nonTransparentBounds(composed))
	}

	var ratingsH int
	// The presentation mode decides how ratings appear. "none" hides them;
	// "editorial" replaces the badge strip with a genre label above a large
	// score; anything else uses the standard badge strip.
	switch req.Config.RatingPresentation {
	case "none":
		// Ratings intentionally hidden.
	case "editorial":
		if len(allRatings) > 0 && len(req.Config.Ratings) > 0 {
			drawEditorialRating(composed, allRatings, meta.Genres, req.Config, scale, occ)
		}
	case "minimal":
		if len(allRatings) > 0 && len(req.Config.Ratings) > 0 {
			drawMinimalRating(composed, allRatings, meta.Genres, meta.IsAnime, req.Config, scale, occ)
		}
	case "dual":
		if len(allRatings) > 0 && len(req.Config.Ratings) > 0 {
			drawDualRating(composed, allRatings, meta.Genres, meta.IsAnime, req.Config, scale, occ, true)
		}
	case "dual-minimal":
		if len(allRatings) > 0 && len(req.Config.Ratings) > 0 {
			drawDualRating(composed, allRatings, meta.Genres, meta.IsAnime, req.Config, scale, occ, false)
		}
	case "average":
		if len(allRatings) > 0 && len(req.Config.Ratings) > 0 {
			drawAverageRating(composed, allRatings, meta.Genres, meta.IsAnime, req.Config, scale, occ)
		}
	case "scorebar":
		// Replace the badge strip with a single full-width score bar coloured by
		// the aggregate score.
		if len(allRatings) > 0 && len(req.Config.Ratings) > 0 {
			drawAggregateBar(composed, allRatings, req.Config, meta.Genres, meta.IsAnime)
		}
	default:
		if len(allRatings) > 0 && len(req.Config.Ratings) > 0 {
			ratingsH = drawBadgesInPlace(composed, allRatings, req.Config)
		}
	}
	{
		if ratingsH > 0 {
			// Reserve the full-width band the ratings strip occupies so corner
			// overlays (notably the ring) float clear of it.
			b := composed.Bounds()
			band := int(20*scale + 0.5)
			switch req.Config.RatingsLayout {
			case imageconfig.LayoutTop:
				occ.reserve(image.Rect(b.Min.X, b.Min.Y, b.Max.X, b.Min.Y+ratingsH+band))
			case imageconfig.LayoutTopBottom:
				// Occupies a row against each edge, so both bands are spoken for.
				occ.reserve(image.Rect(b.Min.X, b.Min.Y, b.Max.X, b.Min.Y+ratingsH+band))
				occ.reserve(image.Rect(b.Min.X, b.Max.Y-ratingsH-band, b.Max.X, b.Max.Y))
			case imageconfig.LayoutSplitSide, imageconfig.LayoutLeft, imageconfig.LayoutRight:
				// Side-anchored: corner overlays rarely conflict — left unreserved.
			default:
				occ.reserve(image.Rect(b.Min.X, b.Max.Y-ratingsH-band, b.Max.X, b.Max.Y))
			}
		}
	}
	if len(req.Config.Badges) > 0 {
		drawQualityBadges(composed, req.Config.Badges, scale, occ, qualityOptsFromConfig(req.Config))
	}
	if req.Config.AgeRating && meta.ContentRating != "" {
		drawAgeRatingBadge(composed, meta.ContentRating, req.Config.AgeRatingPos, scale, occ, ageOptsFromConfig(req.Config))
	}
	if req.Config.ReleaseStatus && meta.ReleaseStatus != "" {
		drawReleaseStatusBadge(composed, meta.ReleaseStatus, req.Config.ReleaseStatusPos, scale, occ, releaseStatusOptsFromConfig(req.Config))
	}
	if req.Config.TopRated && meta.TopRatedRank > 0 {
		drawTopRatedBadge(composed, meta.TopRatedRank, req.Config.TopRatedPos, scale, occ, topRatedOptsFromConfig(req.Config))
	}
	if req.Config.Genre && len(meta.Genres) > 0 {
		drawGenreBadge(composed, meta.Genres, req.Config.GenrePos, scale, occ, genreOptsFromConfig(req.Config, meta.IsAnime))
	}
	if req.Config.Providers && len(meta.WatchProviders) > 0 {
		drawProviderBadges(composed, meta.WatchProviders, scale, occ, req.Config.NetworkTileColor)
	}
	if req.Config.AggregateBar {
		drawAggregateBar(composed, allRatings, req.Config, meta.Genres, meta.IsAnime)
	}
	if req.Config.Trending {
		drawTrendingBadgeSurfaced(composed, scale, occ, trendingStyleFromConfig(req.Config.TrendingStyle), req.Config.TrendingPos, req.Config.TrendingTextColor, req.Config.TrendingTagStyle)
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

	data, contentType, err := render.Encode(composed, req.MediaType, string(req.Config.Size),
		render.Format(req.Config.OutputFormat), req.Config.OutputQuality)
	if err != nil {
		p.log().WarnContext(ctx, "The composed artwork could not be encoded; serving a placeholder",
			"id", logging.RequestID(ctx),
			"media_type", req.MediaType, "media_id", req.MediaID, "error", err)
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		result.Placeholder = true
		return result, nil
	}

	result.ImageBytes = data
	result.ContentType = contentType
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
	// "series" mode skips the episode still and falls through to the normal
	// series artwork path. "still"/"streaming" (and the default) use the still —
	// v3 has no separate streaming-thumbnail source, so streaming maps to still.
	if req.Config.EpisodeArtworkMode == "series" {
		return nil, nil, "", false
	}
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
		Language:           req.Config.Language,
		TextPreference:     string(req.Config.TextPreference),
		Size:               string(req.Config.Size),
		RandomText:         req.Config.RandomPosterText,
		RandomLanguage:     req.Config.RandomPosterLanguage,
		RandomMinVoteCount: req.Config.RandomPosterMinVoteCount,
		RandomMinVoteAvg:   req.Config.RandomPosterMinVoteAverage,
		RandomMinWidth:     req.Config.RandomPosterMinWidth,
		RandomMinHeight:    req.Config.RandomPosterMinHeight,
		RandomFallback:     req.Config.RandomPosterFallback,

		WatchProvidersCountry: req.Config.ProvidersCountry,
	}
	// Try the configured artwork source first, then fall back across the other
	// image-capable providers so a surface missing from one source (most often a
	// logo) is filled from wherever it exists. baseMeta keeps the first
	// provider's metadata for overlays, backfilling image URLs it lacked.
	var baseMeta *provider.MediaMeta
	for _, name := range p.artworkOrder(string(req.Config.ArtworkSource), req.MediaType) {
		prov := p.providers.Get(name)
		if prov == nil {
			continue
		}
		if !providerReady(prov) {
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
			p.log().DebugContext(ctx, "A metadata provider returned no result",
				"id", logging.RequestID(ctx),
				"provider", name, "media_type", req.MediaType, "media_id", req.MediaID,
				"error", err)
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
func (p *Pipeline) artworkOrder(primary, surface string) []string {
	// OMDB only ever returns a poster, so on other surfaces it cannot be the
	// primary; fall straight through to the general sources.
	if primary == string(imageconfig.ArtworkOMDB) && surface != "poster" {
		primary = ""
	}
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
	var extra *provider.MediaMeta
	var err error
	// The top-up needs the configured region too, or the provider badges would
	// fall back to US whenever artwork came from somewhere other than TMDB.
	if af, ok := tmdb.(provider.ArtworkFetcher); ok {
		extra, err = af.FetchArtwork(ctx, req.ContentType, req.MediaID,
			provider.ArtworkOptions{WatchProvidersCountry: req.Config.ProvidersCountry})
	} else {
		extra, err = tmdb.Fetch(ctx, req.ContentType, req.MediaID)
	}
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
func (p *Pipeline) collectRatingsWithProviders(ctx context.Context, req Request, artwork *provider.MediaMeta) ([]provider.Rating, []string) {
	if artwork == nil {
		artwork = &provider.MediaMeta{}
	}
	all := make([]provider.Rating, len(artwork.Ratings))
	copy(all, artwork.Ratings)
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
		if !providerReady(prov) {
			continue
		}
		if !providerWanted(prov, req.Config.Ratings) {
			continue
		}
		wg.Add(1)
		go func(prov provider.Provider) {
			defer wg.Done()
			meta, err := p.fetchRatingsResilient(ctx, prov, req, artwork)
			if err != nil || meta == nil {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			// The rank arrives from whichever provider computes it, not from the
			// artwork source, so carry it across onto the meta the badges read.
			if meta.TopRatedRank > 0 && artwork.TopRatedRank == 0 {
				artwork.TopRatedRank = meta.TopRatedRank
			}
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
