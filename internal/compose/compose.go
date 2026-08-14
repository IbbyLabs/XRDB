// Package compose implements the image composition pipeline.
// It fetches a source image, resizes it to canonical dimensions, and overlays
// rating badges according to the render config.
package compose

import (
	"bytes"
	"context"
	"errors"
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
	"sync/atomic"
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
	// artworkFrom names the provider whose artwork was actually used, set once
	// the artwork is fetched. The ratings pass skips that provider because it has
	// already answered; the configured source is not it when the source could not
	// serve this id and the fallback took over.
	artworkFrom string
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
	// PlaceholderIsOurs is true when the placeholder came from this pipeline
	// giving up rather than from no source having artwork. Remembering it would
	// keep answering with our own impatience after the reason for it is gone.
	PlaceholderIsOurs bool
	// Degraded is true when the render is missing something it wanted through a
	// transient failure: a rating source that answered with an error and left its
	// badge off, or a title logo overlay whose fetch failed. The render is real
	// and worth caching, but only briefly: the full TTL would hold the missing
	// piece long after the cause recovers.
	Degraded bool
	// DegradedByUs is true when everything the render lost was held back by one
	// of our own gates — a quota reserve, a pacing queue — rather than by a
	// source refusing or failing. The render is complete apart from a piece we
	// chose not to ask for, so it is worth storing; a render that lost a source
	// to a failure is not.
	DegradedByUs bool
	// DegradedByQueue is true when one of those gates was a request queue rather
	// than the daily reserve. A queue clears in seconds and the reserve stands
	// for hours, so the two are worth caching for different lengths of time.
	DegradedByQueue bool
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
	// trending reports whether a title is trending. Optional: nil draws no badge.
	trending trendingResolver
	// ratings remembers what each source said about a title, so the same title
	// under a different config is not fetched twice. Optional: nil disables it.
	ratings *ratingsCache
	// queueWait is how long the render queue in front of this pipeline is
	// willing to wait for a slot. Zero leaves the artwork stage bounded by the
	// fetch budget alone.
	queueWait time.Duration
	// quality reports which release qualities a title has, so a quality badge
	// can stand for something. Optional: nil draws the picked badges as-is.
	quality qualityDetector
	// badPosters remembers a source's preferred poster file that lost to its own
	// alternate, so the comparison costs one extra fetch per title rather than
	// one per render.
	badPosters badPosters
	// streamBreak stops asking a stream addon that has stopped answering.
	streamBreak  streamBreaker
	qualityCache *qualityCache
}

// trendingResolver is satisfied by *provider.TrendingIndex.
type trendingResolver interface {
	IsTrending(ctx context.Context, ids ...string) bool
}

// SetTrendingResolver attaches the trending index.
func (p *Pipeline) SetTrendingResolver(t trendingResolver) { p.trending = t }

// isTrending reports whether the title is in the trending list.
func (p *Pipeline) isTrending(ctx context.Context, req Request, meta *provider.MediaMeta) bool {
	if p.trending == nil {
		return false
	}
	ids := []string{req.MediaID}
	if meta != nil {
		// The index holds TMDB ids, so a tt request reaches it only through the
		// TMDB id the metadata fetch already resolved.
		ids = append(ids, meta.TMDBID, meta.IMDbID)
	}
	return p.trending.IsTrending(ctx, ids...)
}

// animeResolver reports whether a media ID belongs to a known anime. Satisfied
// by *animemap.Mapper, which answers from an in-memory index with no network
// call on the render path.
type animeResolver interface {
	Resolve(ctx context.Context, mediaType, id string) (animemap.IDs, bool)
}

// SetAnimeResolver attaches the anime ID mapper.
func (p *Pipeline) SetAnimeResolver(r animeResolver) { p.anime = r }

// animeTargetResolver maps an anime-service id back to IMDb/TMDB. Optional:
// a resolver that does not implement it leaves anime ids untranslated.
type animeTargetResolver interface {
	ResolveTarget(ctx context.Context, id string) (animemap.Target, bool)
}

// animeKitsuResolver answers for the titles animeTargetResolver cannot: a row
// with a Kitsu id and no mainstream one. Separate interface so a resolver that
// predates it still satisfies the first.
type animeKitsuResolver interface {
	ResolveKitsu(ctx context.Context, id string) (int, bool)
}

// showQualityBadges reports whether the quality row is drawn. The hidden switch
// suppresses the row without touching the selection, so switching it back on
// does not mean picking every badge again.
func showQualityBadges(cfg imageconfig.Config) bool {
	return len(cfg.Badges) > 0 && !cfg.QualityBadgesHidden
}

// resolveAnimeID rewrites a MAL, AniList or Kitsu id into the IMDb or TMDB id
// the artwork and rating sources are keyed on. Catalogues sourced from those
// services hand out ids nothing else in the pipeline understands. A trailing
// season and episode is carried across so episode thumbnails still resolve.
func (p *Pipeline) resolveAnimeID(ctx context.Context, req Request) Request {
	resolver, ok := p.anime.(animeTargetResolver)
	if !ok || resolver == nil {
		return req
	}
	// A leading content-type token comes off first. The tail split below counts
	// colons from the start, so "series:mal:21" would otherwise read its own
	// number as a season and episode.
	rawID := req.MediaID
	for _, tok := range []string{"movie:", "series:", "tv:"} {
		if r, found := strings.CutPrefix(rawID, tok); found {
			rawID = r
			break
		}
	}
	service, num, ok := animemap.ParseAnimeID(rawID)
	if !ok {
		return req
	}
	head := service + ":" + strconv.Itoa(num)
	// Anything after the service and number is a season and episode. Split on
	// the raw id rather than the rebuilt head, which differs for aliases.
	tail := ""
	if parts := strings.SplitN(rawID, ":", 3); len(parts) == 3 {
		tail = ":" + parts[2]
	}
	target, ok := resolver.ResolveTarget(ctx, head)
	if !ok {
		// A season that has aired recently often carries a Kitsu id weeks before
		// TMDB or IMDb list it. Passing the untranslated anime id on leaves every
		// artwork and rating source with something none of them can read, so the
		// render returns nothing at all; Kitsu can draw it.
		if kitsuResolver, canKitsu := resolver.(animeKitsuResolver); canKitsu {
			if kitsu, found := kitsuResolver.ResolveKitsu(ctx, head); found {
				req.MediaID = "kitsu:" + strconv.Itoa(kitsu) + tail
				p.log().DebugContext(ctx, "No mainstream id is mapped for this anime id; using its Kitsu sibling",
					"id", logging.RequestID(ctx), "media_id", req.MediaID)
				return req
			}
		}
		p.log().DebugContext(ctx, "No mainstream id is mapped for this anime id",
			"id", logging.RequestID(ctx), "media_id", req.MediaID)
		return req
	}
	switch {
	case target.IMDb != "":
		req.MediaID = target.IMDb + tail
	case target.TMDB != 0:
		kind := "series"
		if target.TMDBType == "movie" {
			kind = "movie"
		}
		req.MediaID = "tmdb:" + kind + ":" + strconv.Itoa(target.TMDB) + tail
	default:
		return req
	}
	p.log().DebugContext(ctx, "Resolved an anime id to its mainstream id",
		"id", logging.RequestID(ctx), "from", head, "to", req.MediaID)
	return req
}

// needsAnimeFlag reports whether anything this config draws reads IsAnime.
// Resolving it costs a mapper lookup, so a config that never reads it must not
// pay for it. Mirrors the draw calls that take the flag.
func needsAnimeFlag(cfg imageconfig.Config) bool {
	if cfg.Genre || cfg.AggregateBar {
		return true
	}
	// The anime rating and artwork overrides are only reachable once the kind is
	// known.
	if len(cfg.RatingsAnime) > 0 || cfg.ArtworkSourceAnime != "" {
		return true
	}
	switch cfg.RatingPresentation {
	case "minimal", "dual", "dual-minimal", "average", "scorebar":
		return true
	}
	return false
}

// fillContentRating takes an age rating from a rating source for a title the
// artwork source had no certification for. It fills a gap, never replaces one.
func fillContentRating(artwork *provider.MediaMeta, rating string) {
	if rating != "" && artwork.ContentRating == "" {
		artwork.ContentRating = rating
	}
}

// resolveContentKind answers whether the title is a movie or a series when the
// request did not say. A per-type override is meaningless without it, and the
// common artwork URLs carry no ?type=. Only configs that set an override pay
// for the lookup.
func (p *Pipeline) resolveContentKind(ctx context.Context, req Request) string {
	if req.ContentType != "" {
		return req.ContentType
	}
	// An id carrying a season and an episode is a series by construction. Read
	// through the same parser the episode path uses, so a shape one of them
	// accepts cannot be a shape the other does not.
	if _, _, _, ok := parseEpisodeID(req.MediaID); ok {
		return "series"
	}
	// The kind can also lead the id, which is the {type}:{id} shape AIOMetadata
	// emits. Read before the tmdb: branch: "series:tmdb:330176" carries it here
	// and nowhere else.
	for _, tok := range []string{"movie:", "series:", "tv:"} {
		if strings.HasPrefix(req.MediaID, tok) {
			if tok == "movie:" {
				return "movie"
			}
			return "series"
		}
	}
	// A TMDB id names the kind already, so it costs nothing to read.
	if rest, ok := strings.CutPrefix(req.MediaID, "tmdb:"); ok {
		switch {
		case strings.HasPrefix(rest, "movie:"):
			return "movie"
		case strings.HasPrefix(rest, "series:"), strings.HasPrefix(rest, "tv:"):
			return "series"
		}
	}
	if p.providers == nil {
		return ""
	}
	tmdb := p.providers.Get("tmdb")
	if tmdb == nil || !providerReady(tmdb) {
		return ""
	}
	// A bare "tmdb:1726" names no kind, and find-by-external-id cannot answer
	// for it: a TMDB id is not external to TMDB. The record settles it instead,
	// since it exists under exactly one of /movie and /tv. Answers are kept, so
	// the probe is paid once per id rather than once per render.
	if rest, ok := strings.CutPrefix(req.MediaID, "tmdb:"); ok && isNumericID(rest) {
		byKind, ok := tmdb.(provider.KindIdentifier)
		if !ok {
			return ""
		}
		kind, err := byKind.KindOfTMDBID(ctx, rest)
		if err != nil {
			p.log().DebugContext(ctx, "Could not resolve the kind of a TMDB id for a per-type override",
				"id", logging.RequestID(ctx), "media_id", req.MediaID, "error", err)
			return ""
		}
		return kind
	}
	ident, ok := tmdb.(provider.TitleIdentifier)
	if !ok {
		return ""
	}
	_, kind, err := ident.IdentifyID(ctx, titleID(req.MediaID), "")
	if err != nil {
		p.log().DebugContext(ctx, "Could not resolve the kind of title for a per-type override",
			"id", logging.RequestID(ctx), "media_id", req.MediaID, "error", err)
		return ""
	}
	return kind
}

// isNumericID reports whether s is a non-empty run of digits.
func isNumericID(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// tmdbNumericID resolves the request to a numeric TMDB id, which MediUX is keyed
// on. A tmdb: id or a known id already in hand is used directly; a tt-id is
// resolved through the TMDB provider.
func (p *Pipeline) tmdbNumericID(ctx context.Context, req Request, known string) (string, bool) {
	if isNumericID(known) {
		return known, true
	}
	if rest, ok := strings.CutPrefix(titleID(req.MediaID), "tmdb:"); ok {
		// tmdb:movie:1726 / tmdb:1726 — take the trailing number.
		parts := strings.Split(rest, ":")
		last := parts[len(parts)-1]
		if isNumericID(last) {
			return last, true
		}
	}
	tmdb := p.providers.Get("tmdb")
	if tmdb == nil {
		return "", false
	}
	ident, ok := tmdb.(provider.TitleIdentifier)
	if !ok {
		return "", false
	}
	id, _, err := ident.IdentifyID(ctx, titleID(req.MediaID), req.ContentType)
	if err != nil || !isNumericID(id) {
		return "", false
	}
	return id, true
}

// titleID is the id that names the *title*, which for an episode is its series.
//
// Anything asking "what work is this" — is it an anime, which Kitsu entry is it,
// which TMDB number is it — wants this rather than req.MediaID. An episode id
// carries a season and an episode on the end, and every lookup keyed on titles
// rejects the whole string, so passing it produces a confident "no" for a title
// the source knows perfectly well.
//
// Read through parseEpisodeID, the same parser the episode path uses, so a shape
// one of them accepts cannot be a shape the other does not.
func titleID(mediaID string) string {
	if series, _, _, ok := parseEpisodeID(mediaID); ok {
		return series
	}
	return mediaID
}

// kitsuID maps the requested title onto the Kitsu id Kitsu answers to. A title
// the anime map does not carry has no Kitsu entry to find.
func (p *Pipeline) kitsuID(ctx context.Context, req Request) (string, bool) {
	if strings.HasPrefix(req.MediaID, "kitsu:") {
		return req.MediaID, true
	}
	if p.anime == nil {
		return "", false
	}
	ids, ok := p.anime.Resolve(ctx, req.MediaType, titleID(req.MediaID))
	if !ok || ids.Kitsu == 0 {
		return "", false
	}
	return "kitsu:" + strconv.Itoa(ids.Kitsu), true
}

// isAnimeTitle reports whether the requested title is a known anime.
func (p *Pipeline) isAnimeTitle(ctx context.Context, req Request) bool {
	if p.anime == nil || !needsAnimeFlag(req.Config) {
		return false
	}
	_, ok := p.anime.Resolve(ctx, req.MediaType, titleID(req.MediaID))
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
	// mediuxKey is the instance MediUX token used for images.mediux.io asset
	// fetches when the render carries no owner token. MediUX gates every asset
	// behind the Bearer header.
	mediuxKey string
}

func (f *httpFetcher) Fetch(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	// MediUX serves its assets only to an authenticated request, so the token
	// (owner's own, else the instance default) rides the image fetch too.
	if strings.Contains(url, "images.mediux.io") {
		if tok := provider.MediuxTokenFor(ctx, f.mediuxKey); tok != "" {
			req.Header.Set("Authorization", "Bearer "+tok)
		}
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
	// A provider can be registered and not yet usable. Credentials are one way
	// of being unusable; a local dataset that failed to load is another, and it
	// carries no credentials at all, so asking only about those reports a
	// broken dataset as ready and lets it win a source it cannot answer for.
	if r, ok := p.(interface{ Ready() bool }); ok && !r.Ready() {
		return false
	}
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
func providerWanted(p provider.Provider, cfg imageconfig.Config, contentType string) bool {
	sourcer, ok := p.(provider.RatingSourcer)
	if !ok {
		return true
	}
	// The top-rated badge reads a rank that rides along with a provider's
	// ratings, so a ranking source stays in even when its score is not shown.
	if cfg.TopRated {
		if r, ranks := p.(provider.Ranker); ranks && r.RanksTitles() {
			return true
		}
	}
	// The awards badge rides along with a provider that reports awards, so that
	// source stays in even when none of its scores are shown.
	if cfg.Awards {
		if a, ok := p.(interface{ ProvidesAwards() bool }); ok && a.ProvidesAwards() {
			return true
		}
	}
	for _, source := range sourcer.RatingSources() {
		for _, want := range imageconfig.RatingsCandidatesForType(cfg, contentType) {
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

// SetRatingsCacheTTL replaces the ratings cache with one using the given TTL.
// A TTL of zero or less disables the cache.
func (p *Pipeline) SetRatingsCacheTTL(ttl time.Duration) {
	if ttl <= 0 {
		p.ratings = nil
		return
	}
	p.ratings = newRatingsCache(ttl)
}

// CachedRatings reports how many source answers are held.
func (p *Pipeline) CachedRatings() int { return p.ratings.Len() }

// Health returns the attached tracker, or nil.
func (p *Pipeline) Health() *provider.HealthTracker { return p.health }

// fetchRatingsResilient wraps fetchRatings with the last-known-good fallback.
//
// Two failure shapes matter and neither used to leave a trace. A hard error is
// the obvious one. The quieter one is a success carrying no ratings, which is
// what a scraped source produces the day its markup changes; treating that as a
// real answer is what silently erased a badge from every render. Both fall back
// to the previous good answer for the same title when one is remembered.
// answerKeptItsSources reports whether an answer carries at least as many
// ratings as the same title carried last time. A source metered by the day
// stops filling fields rather than failing once its allowance is spent, so a
// thinner answer than before is the shape that outage takes.
func (p *Pipeline) answerKeptItsSources(source, key string, meta *provider.MediaMeta) bool {
	if p.health == nil || meta == nil {
		return true
	}
	prev, ok := p.health.LastGood(source, key)
	if !ok || prev == nil {
		return true
	}
	return len(meta.Ratings) >= len(prev.Ratings)
}

// The bool reports a result served from memory rather than fetched. A render
// carrying one is not evidence the source answered, and counting it as one
// inflates the denominator every hold-out warning is read against.
// recordsAgainstTheSource reports whether a failed fetch says anything about the
// source. It must not be decided from the returned error alone: when the HTTP
// client's own timer fires at the same moment the render context is cancelled,
// Go returns an error that satisfies DeadlineExceeded rather than Canceled, so
// an abandoned render reads as the source timing out. The context is the
// reliable signal.
//
// A timeout with a live context is the source failing and does count.
func recordsAgainstTheSource(ctx context.Context, err error) bool {
	return ctx.Err() == nil && !errors.Is(err, context.Canceled)
}

func (p *Pipeline) fetchRatingsResilient(ctx context.Context, prov provider.Provider, req Request, artwork *provider.MediaMeta) (*provider.MediaMeta, bool, error) {
	// A render carrying the owner's own credential for this source has its own
	// upstream allowance, so the shared key's cooldown does not apply to it. This
	// is the whole point of a per-profile key: it is exactly the render that must
	// still reach the source when the shared key is exhausted.
	ownerKeyed := provider.HasOwnerKey(ctx, prov.Name())
	callerClass := provider.CallerClassFrom(ctx)
	if !ownerKeyed && p.health != nil && p.health.CoolingOff(prov.Name(), callerClass) {
		gate, heldOut := provider.GateCooldown, provider.ErrCoolingOff
		if p.health.CooldownReason(prov.Name(), callerClass) == provider.CooldownFailureBreaker {
			gate, heldOut = provider.GateFailureBreaker, provider.ErrFailureBreaker
		}
		// The source is refusing on rate-limit grounds. Waiting for it to say so
		// again costs the render seconds, so take the remembered value instead.
		key := provider.GoodKey(prov.Name(), req.ContentType, req.MediaID)
		if good, age, ok := p.health.LastGoodAge(prov.Name(), key); ok {
			p.log().InfoContext(ctx, "A ratings source is held out; serving a remembered rating",
				"id", logging.RequestID(ctx), "source", prov.Name(),
				"media_id", req.MediaID, "gate", gate,
				"outcome", outcomeRemembered, "age_ms", age.Milliseconds())
			return good, true, nil
		}
		return nil, false, fmt.Errorf("%s: %w", prov.Name(), heldOut)
	}
	// A catalogue sweep draws on the same daily allowance a person's render
	// needs, and the source answers nobody once it is spent. Bulk callers are
	// held out of the last of it. This skips the source rather than failing it:
	// a recorded failure cools the source off for every caller, which is the
	// outcome the reserve exists to prevent.
	if !ownerKeyed && provider.CallerClassFrom(ctx) == provider.CallerBulk && !provider.BulkCallerMayReach(prov.Name()) {
		key := provider.GoodKey(prov.Name(), req.ContentType, req.MediaID)
		if p.health != nil {
			if good, age, ok := p.health.LastGoodAge(prov.Name(), key); ok {
				p.log().InfoContext(ctx, "A ratings source is held out; serving a remembered rating",
					"id", logging.RequestID(ctx), "source", prov.Name(),
					"media_id", req.MediaID, "gate", provider.GateBulkAllowance,
					"outcome", outcomeRemembered, "age_ms", age.Milliseconds())
				return good, true, nil
			}
		}
		return nil, false, fmt.Errorf("%s: %w", prov.Name(), provider.ErrBulkAllowanceHeld)
	}
	cacheKey := provider.GoodKey(prov.Name(), req.ContentType, req.MediaID)
	// Concurrent renders of one title share a single fetch, so a follower's
	// elapsed time is the leader's whole round trip and costs the source
	// nothing. Timed apart from the fetch: the two are the same number to a
	// caller and only one of them is work.
	fetched, waitStart := false, time.Now()
	meta, err := p.ratings.do(ctx, cacheKey, func() (*provider.MediaMeta, bool, error) {
		fetched = true
		m, ferr := p.fetchRatings(ctx, prov, req, artwork)
		return m, p.answerKeptItsSources(prov.Name(), cacheKey, m), ferr
	})
	if !fetched {
		p.log().DebugContext(ctx, "A ratings source's answer was waited on rather than fetched",
			"id", logging.RequestID(ctx), "source", prov.Name(),
			"media_id", req.MediaID, "waited_ms", time.Since(waitStart).Milliseconds())
	}
	if p.health == nil {
		return meta, false, err
	}
	key := cacheKey

	if err == nil && meta != nil && len(meta.Ratings) > 0 {
		if ownerKeyed {
			// The owner's key succeeding against its own allowance says nothing
			// about the shared key's health, so it only caches the result and
			// must not clear the shared cooldown.
			p.health.Remember(key, meta)
		} else if p.health.Success(prov.Name(), key, meta) {
			p.log().WarnContext(ctx, "A ratings source recovered and is answering again",
				"id", logging.RequestID(ctx), "source", prov.Name())
		}
		return meta, false, nil
	}
	if err != nil && !ownerKeyed {
		// An owner key failing says nothing about the shared source's health: it
		// is a different credential with its own allowance. Recording it would let
		// one exhausted owner key set the shared cooldown for every other render.
		if recordsAgainstTheSource(ctx, err) && p.health.Failure(prov.Name(), err, callerClass) {
			// The transition into cooldown, logged once, is what makes a failing
			// source visible instead of silently dropping its badge from every
			// render. Naming the reason matters as much: reporting a rejected
			// key or a malformed reply as a rate limit sends whoever reads this
			// to the wrong place.
			var rl *provider.RateLimitError
			reason := "is failing"
			if errors.As(err, &rl) {
				reason = "is rate-limited"
			}
			p.log().WarnContext(ctx, "A ratings source "+reason+" and is held out until it recovers",
				"id", logging.RequestID(ctx), "source", prov.Name(), "error", err)
		}
	}
	if good, age, ok := p.health.LastGoodAge(prov.Name(), key); ok {
		p.log().WarnContext(ctx, "A ratings source is degraded; serving its last known good result",
			"id", logging.RequestID(ctx), "source", prov.Name(),
			"media_id", req.MediaID, "outcome", outcomeRemembered,
			"age_ms", age.Milliseconds(), "error", err)
		return good, true, nil
	}
	if err == nil && meta != nil && len(meta.Ratings) == 0 && !ownerKeyed {
		// Nothing remembered and nothing returned. Record it so a source that
		// starts answering empty still shows up as unhealthy. Skipped for an
		// owner-keyed render, which does not speak for the shared source.
		p.health.Success(prov.Name(), key, meta)
	}
	return meta, false, err
}

// ratingIDForSources swaps a non-IMDb id for the IMDb id the artwork source
// reported. Rating sources are keyed by IMDb id.
func ratingIDForSources(id string, meta *provider.MediaMeta) string {
	if meta == nil || meta.IMDbID == "" || strings.HasPrefix(id, "tt") {
		return id
	}
	// Episode ids carry season and episode after the title id; keep that tail.
	if _, season, episode, ok := parseEpisodeID(id); ok {
		return fmt.Sprintf("%s:%d:%d", meta.IMDbID, season, episode)
	}
	return meta.IMDbID
}

// errArtStageDeadline marks artwork that failed because this pipeline stopped
// waiting, rather than because no source had any. The two produce the same
// placeholder and must not be remembered the same way: a source with nothing is
// a fact about the title, and our own impatience is not.
var errArtStageDeadline = errors.New("artwork stage deadline")

// defaultArtFetchTimeout bounds the source-artwork fetch absent an override
// from config. A normal fetch runs around a second; a stalled one otherwise
// holds a render slot idle, deepening the queue for everything behind it.
const defaultArtFetchTimeout = 5 * time.Second

// newArtFetchTransport is tuned for many concurrent renders fetching from a
// small set of art CDNs. The default transport's two idle connections per host
// serialize those renders behind a handful of sockets under load.
func newArtFetchTransport() *http.Transport {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.MaxIdleConns = 100
	t.MaxIdleConnsPerHost = 16
	t.MaxConnsPerHost = 32
	t.IdleConnTimeout = 90 * time.Second
	t.ForceAttemptHTTP2 = true
	return t
}

// artworkCarriesTitle reports whether the surface being drawn already has the
// title in the picture, so the logo overlay would print it twice. It asks the
// surface actually chosen: backdrops usually carry no title, some do.
func artworkCarriesTitle(meta *provider.MediaMeta, mediaType string, cfg imageconfig.Config) bool {
	if meta == nil || mediaType == "logo" {
		return false
	}
	surface := selectSurfaceURL(meta, mediaType, cfg)
	if meta.PosterURL != "" && surface == meta.PosterURL {
		return !meta.PosterTextless
	}
	if meta.BackdropURL != "" && surface == meta.BackdropURL {
		return meta.BackdropHasTitle
	}
	return false
}

// New creates a Pipeline with the given provider registry.
func New(reg *provider.Registry) *Pipeline {
	return &Pipeline{
		providers: reg,
		fetcher: &httpFetcher{client: &http.Client{
			Timeout:   defaultArtFetchTimeout,
			Transport: newArtFetchTransport(),
		}},
		logger:  slog.Default(),
		ratings: newRatingsCache(DefaultRatingsCacheTTL),
	}
}

// artStageTimeout is how long the whole source-artwork stage may take, derived
// from the per-fetch budget so raising one raises the other and an operator has
// a single knob rather than two that can contradict each other.
func (p *Pipeline) artStageTimeout() time.Duration {
	return p.artStageTimeoutFor(p.queueWait)
}

func (p *Pipeline) artStageTimeoutFor(queueWait time.Duration) time.Duration {
	stage := 2 * p.artFetchTimeout()
	// A stage that outlives the queue's patience guarantees shedding: the slot
	// is still held by work that has not given up while everyone behind it is
	// already being refused. Three quarters leaves room for the ratings and the
	// compose that follow.
	if queueWait > 0 {
		if bound := queueWait * 3 / 4; bound < stage {
			stage = bound
		}
	}
	return stage
}

// SetRenderQueueWait tells the pipeline how long the queue in front of it waits
// for a slot, so the artwork stage can be held inside that window.
//
// The window wins even when it leaves less than one fetch: a render that cannot
// finish before the callers behind it are refused is not worth the slot it
// holds. That pairing is a misconfiguration rather than a trade-off, so it is
// said out loud instead of being resolved silently.
func (p *Pipeline) SetRenderQueueWait(d time.Duration) {
	if d <= 0 {
		return
	}
	p.queueWait = d
	if stage := p.artStageTimeoutFor(d); stage < p.artFetchTimeout() {
		p.log().Warn("The render queue gives up sooner than one artwork fetch can finish",
			"queue_wait", d, "artwork_stage", stage, "artwork_fetch", p.artFetchTimeout())
	}
}

// artFetchTimeout is the budget for a single artwork request.
func (p *Pipeline) artFetchTimeout() time.Duration {
	if f, ok := p.fetcher.(*httpFetcher); ok && f.client != nil && f.client.Timeout > 0 {
		return f.client.Timeout
	}
	return defaultArtFetchTimeout
}

// SetArtFetchTimeout overrides the source-artwork fetch timeout. No-op when
// the fetcher is a test double or d is not positive.
func (p *Pipeline) SetArtFetchTimeout(d time.Duration) {
	if d <= 0 {
		return
	}
	if f, ok := p.fetcher.(*httpFetcher); ok {
		f.client.Timeout = d
	}
}

// SetMediuxKey gives the image fetcher the instance MediUX token for asset
// fetches. No-op when the fetcher is a test double.
func (p *Pipeline) SetMediuxKey(key string) {
	if f, ok := p.fetcher.(*httpFetcher); ok {
		f.mediuxKey = key
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
// What became of a source on this render, as a value rather than a shape. A
// reader that tells a hold-out from a remembered answer by which fields are
// present breaks silently the first time someone adds one of them.
const (
	outcomeHeldOut    = "held_out"
	outcomeRemembered = "remembered"
)

// unavailableSources turns the providers held out of a render into the rating
// sources the strip is filtered by. The two are the same string only by
// coincidence: MDBList alone answers thirteen sources and no provider is called
// "imdb", so naming the provider drew one badge nobody had configured and left
// the rest silently missing.
//
// A source another provider answered is not unavailable — if OMDb served imdb
// while MDBList was down, imdb has its score and must not be crossed out.
func (p *Pipeline) unavailableSources(degradedProviders, wanted []string, got []provider.Rating) []string {
	if len(degradedProviders) == 0 || len(wanted) == 0 {
		return nil
	}
	answered := make(map[string]bool, len(got))
	for _, r := range got {
		answered[strings.ToLower(r.Source)] = true
	}
	want := make(map[string]bool, len(wanted))
	for _, s := range wanted {
		want[strings.ToLower(s)] = true
	}

	seen := make(map[string]bool)
	var out []string
	for _, name := range degradedProviders {
		// The provider's own name is the fallback for one that does not declare
		// its sources.
		sources := []string{name}
		if prov := p.providers.Get(name); prov != nil {
			if rs, ok := prov.(provider.RatingSourcer); ok {
				sources = rs.RatingSources()
			}
		}
		for _, src := range sources {
			key := strings.ToLower(src)
			if !want[key] || answered[key] || seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, src)
		}
	}
	return out
}

func (p *Pipeline) Render(ctx context.Context, req Request) (*Result, error) {
	timings := newRenderTimings()
	defer func() { timings.log(ctx, p.log(), req) }()

	req = p.resolveAnimeID(ctx, req)
	timings.mark("anime_id")
	dim := render.DimensionsForSize(req.MediaType, string(req.Config.Size))
	cacheKey := buildCacheKey(req)
	result := &Result{
		CacheKey:    cacheKey,
		ContentType: "image/png",
	}

	badgeCfg := imageconfigBadges{
		badges: req.Config.Badges,
		hidden: req.Config.QualityBadgesHidden,
	}
	// A request that already names an IMDb id needs nothing from the artwork
	// fetch, so the addon is asked alongside it rather than after it. That fetch
	// is serial and, on a title no source has cached, the longest phase of the
	// render. A TMDB id has to wait: resolving it is what the fetch does.
	var resolveQuality qualityResolver
	if strings.HasPrefix(req.MediaID, "tt") {
		resolveQuality = p.startQualityDetect(ctx, badgeCfg, req.ContentType, req.MediaID)
	}

	// Which provider supplies the artwork can depend on the kind of title, and
	// the fetch below is what would otherwise settle that first. When an
	// override is configured the kind is resolved here instead, and the answer
	// is carried forward so the lookup runs once.
	animeKnown := false
	isAnime := false
	// The kind is resolved once and reused: both per-type overrides read it, and
	// a bare /poster/tt... request carries no ?type= for either to work from.
	contentKind := req.ContentType
	if imageconfig.HasPerTypeArtwork(req.Config) || imageconfig.HasPerTypeRatings(req.Config) {
		contentKind = p.resolveContentKind(ctx, req)
		timings.mark("content_kind")
		// Hand the resolved kind down to the rating sources. Without it a series
		// spends a wasted lookup on every source that keys by type.
		if req.ContentType == "" && contentKind != "" {
			req.ContentType = contentKind
		}
	}
	if imageconfig.HasPerTypeArtwork(req.Config) {
		isAnime = p.isAnimeTitle(ctx, req)
		animeKnown = true
		req.Config.ArtworkSource = imageconfig.ArtworkSourceFor(req.Config, contentKind, isAnime)
	}

	sourceBytes, meta, ratingID, artworkFrom, err := p.fetchSourceImageAndMeta(ctx, req)
	timings.mark("artwork")

	if err != nil || len(sourceBytes) == 0 {
		p.log().WarnContext(ctx, "No source artwork was available; serving a placeholder",
			"id", logging.RequestID(ctx),
			"media_type", req.MediaType, "media_id", req.MediaID,
			"artwork_source", string(req.Config.ArtworkSource), "error", err)
		result.ImageBytes = render.PlaceholderPNG(req.MediaType)
		result.Placeholder = true
		result.PlaceholderIsOurs = errors.Is(err, errArtStageDeadline)
		return result, nil
	}

	srcImg, err := decodeImage(sourceBytes)
	timings.mark("decode")
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
	ratingReq.MediaID = ratingIDForSources(ratingID, meta)
	ratingReq.artworkFrom = artworkFrom
	// A TMDB id only becomes an IMDb one here, so this is the earliest the addon
	// can be asked about it. Either way the call overlaps the rating fan-out and
	// is awaited only once the badge row is about to be drawn.
	if resolveQuality == nil {
		resolveQuality = p.startQualityDetect(ctx, badgeCfg, req.ContentType, ratingReq.MediaID)
	}
	allRatings, ratingProviders, degraded, sourceFault, queueHeld, degradedSources := p.collectRatingsWithProviders(ctx, ratingReq, meta)
	timings.mark("ratings")
	// Resolved here, where the title's identity is, so the draw path receives an
	// answer rather than an id and never needs to know a bundled list exists.
	facts := titleFactsFor(meta, req.MediaID)
	result.ContributingProviders = append([]string{string(req.Config.ArtworkSource)}, ratingProviders...)
	result.Degraded = degraded
	result.DegradedByUs = degraded && !sourceFault
	result.DegradedByQueue = result.DegradedByUs && queueHeld
	// A held-out source keeps its place in the strip so the gap is visible.
	// Kept out of allRatings deliberately: that list feeds the average, the
	// ring and the score bar, and a placeholder carries no score to average.
	// A rating resting on a handful of votes claims more than it can support, so
	// it is dropped before the average, the ring and the bar see it.
	allRatings, thinSources := splitThinRatings(allRatings, req.Config)
	for _, name := range thinSources {
		p.log().DebugContext(ctx, "Hid a rating with too few votes to mean anything",
			"source", name, "media_id", req.MediaID)
	}
	stripRatings := allRatings
	// Turning the mark off leaves the source out of the strip entirely rather
	// than drawing an empty dimmed plate, which would say less than nothing.
	if req.Config.RatingUnavailableMark {
		for _, name := range p.unavailableSources(degradedSources, req.Config.Ratings, allRatings) {
			stripRatings = append(stripRatings, provider.Rating{Source: name, Unavailable: true})
		}
	}
	// A rating hidden for thin votes keeps its place in the strip under the same
	// mark as a held-out one: the source was wanted and is not being shown.
	if req.Config.RatingUnavailableMark {
		for _, name := range thinSources {
			stripRatings = append(stripRatings, provider.Rating{Source: name, Unavailable: true, Withheld: true})
		}
	}
	if animeKnown {
		meta.IsAnime = isAnime
	} else {
		meta.IsAnime = p.isAnimeTitle(ctx, req)
	}
	timings.mark("anime_lookup")

	// The kind of title is only known once the anime lookup has answered, so the
	// per-type rating override is resolved here and every consumer below reads
	// the one list. Without an override this is exactly cfg.Ratings.
	req.Config.Ratings = imageconfig.RatingsFor(req.Config, contentKind, meta.IsAnime)

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
		if band := ratingsBandHeight(dim.Width, dim.Height, stripRatings, req.Config, facts); band > 0 {
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
	timings.mark("resize")

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
		// Gated on the list it draws, not on allRatings. An outage that takes
		// every configured source leaves allRatings empty, and gating on that
		// drew nothing in the one case this exists for.
		if len(stripRatings) > 0 && len(req.Config.Ratings) > 0 {
			ratingsH = drawBadgesInPlace(composed, stripRatings, req.Config, facts)
		}
	}
	if ratingsH > 0 {
		// Reserve the full-width band the ratings strip occupies so corner
		// overlays (notably the ring) float clear of it. The strip is drawn with
		// its own vertical offset, so the band carries the same offset or a
		// corner overlay avoids where the strip is not.
		_, stripOffsetY := ratingStripOffsets(req.Config)
		band := int(20*scale + 0.5)
		for _, r := range ratingBands(composed.Bounds(), ratingsH, band, stripOffsetY, req.Config.RatingsLayout) {
			occ.reserve(r)
		}
	}
	if showQualityBadges(req.Config) {
		badges := req.Config.Badges
		if resolveQuality != nil {
			var verified bool
			badges, verified = resolveQuality()
			timings.mark("quality")
			// An unverified row is the picked badges drawn on trust. Holding it
			// for the full TTL would keep an addon's outage on the poster long
			// after the addon came back.
			if !verified {
				result.Degraded = true
				result.DegradedByUs = false
			}
		}
		if len(badges) > 0 {
			drawQualityBadges(composed, badges, scale, occ, qualityOptsFromConfig(req.Config))
		}
	}
	if req.Config.AgeRating && meta.ContentRating != "" {
		// Drawn before the badges so the occupancy map keeps them clear of it.
		drawMetaLine(composed, *meta, req.Config, scale, occ)

		drawAgeRatingBadge(composed, meta.ContentRating, req.Config.AgeRatingPos, scale, occ, ageOptsFromConfig(req.Config))
	}
	if req.Config.ReleaseStatus && meta.ReleaseStatus != "" {
		drawReleaseStatusBadge(composed, meta.ReleaseStatus, req.Config.ReleaseStatusPos, scale, occ, releaseStatusOptsFromConfig(req.Config))
	}
	if req.Config.TopRated && meta.TopRatedRank > 0 {
		drawTopRatedBadge(composed, meta.TopRatedRank, req.Config.TopRatedPos, scale, occ, topRatedOptsFromConfig(req.Config))
	}
	if req.Config.Awards && meta.Awards.Has() {
		drawAwardsBadge(composed, meta.Awards, req.Config.AwardsPos, scale, occ, awardsOptsFromConfig(req.Config))
	}
	if req.Config.Stinger && meta.Stinger.Has() {
		drawStingerBadge(composed, meta.Stinger, req.Config.StingerPos, scale, occ, stingerOptsFromConfig(req.Config))
	}
	// The ring claims its corner before the strips do. It is a fixed circle that
	// can neither narrow nor move, while a genre strip can drop a genre and a
	// provider row can drop a chip, so reserving it first is what leaves the
	// elastic overlays something to measure against. It also now precedes the
	// trending tag and the aggregate bar, both of which can move and it cannot.
	if req.Config.RatingRing {
		drawAverageRatingRing(composed, allRatings, req.Config, scale, occ)
	}
	if req.Config.Genre && len(meta.Genres) > 0 {
		drawGenreBadge(composed, meta.Genres, req.Config.GenrePos, scale, occ, genreOptsFromConfig(req.Config, meta.IsAnime))
	}
	if req.Config.Providers && len(meta.WatchProviders) > 0 {
		drawProviderBadges(composed, meta.WatchProviders, scale, occ, providerOptsFromConfig(req.Config))
	}
	if req.Config.AggregateBar {
		drawAggregateBar(composed, allRatings, req.Config, meta.Genres, meta.IsAnime)
	}
	if req.Config.Trending && p.isTrending(ctx, req, meta) {
		drawTrendingBadgeSurfaced(composed, scale, occ, trendingStyleFromConfig(req.Config.TrendingStyle), req.Config.TrendingPos, req.Config.TrendingTextColor, req.Config.TrendingTagStyle, trendingOptsFromConfig(req.Config))
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
	// A "clean" request no source could honour comes back as ordinary art with
	// the title baked in. Compositing the logo onto that prints the title twice,
	// so the overlay asks what actually arrived rather than what was asked for.
	// Only art taken from the poster can carry a baked-in title; a backdrop is
	// language-neutral by nature.
	cleanOverlay := req.Config.TextPreference == imageconfig.TextClean && req.MediaType != "logo"
	// Whether the title is already in the artwork is a property of the artwork,
	// not of the switch that asked for the logo, and it is asked of whichever
	// surface is actually being drawn. Backdrops usually carry no title; some do.
	titleAlreadyDrawn := artworkCarriesTitle(meta, req.MediaType, req.Config)
	wantsLogoOverlay := (req.Config.BackdropLogo || cleanOverlay ||
		(req.MediaType == "poster" && req.Config.BackdropAsPoster && meta.BackdropURL != "")) &&
		!titleAlreadyDrawn
	timings.mark("overlays")
	if wantsLogoOverlay && meta.LogoURL != "" {
		p.log().DebugContext(ctx, "Overlaying a title logo",
			"id", logging.RequestID(ctx), "logo_url", meta.LogoURL,
			"language", req.Config.Language, "clean", cleanOverlay)
		if logoBytes, err := p.fetcher.Fetch(ctx, meta.LogoURL); err == nil {
			drawBackdropLogoOverlay(composed, logoBytes, ratingsH, logoOptsFromConfig(req.Config))
		} else {
			// The poster is served titleless, indistinguishable from deliberate
			// textless art. Marking it degraded caps its cache TTL so a transient
			// fetch failure is not frozen for the full retention.
			p.log().WarnContext(ctx, "The title logo could not be fetched; serving the poster without it",
				"id", logging.RequestID(ctx),
				"media_id", req.MediaID, "logo_url", meta.LogoURL, "error", err)
			result.Degraded = true
			result.DegradedByUs = false
		}
		timings.mark("logo_overlay")
	} else if wantsLogoOverlay {
		// Wanted an overlay but no logo URL arrived. Usually permanent for a
		// title, so it is not marked degraded; logged apart from a fetch failure
		// because the two share a symptom.
		p.log().DebugContext(ctx, "A title logo overlay was wanted but no logo URL was available",
			"id", logging.RequestID(ctx), "media_id", req.MediaID)
	}

	data, contentType, err := render.Encode(composed, req.MediaType, string(req.Config.Size),
		render.Format(req.Config.OutputFormat), req.Config.OutputQuality)
	timings.mark("encode")
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
		Language:         req.Config.Language,
		FallbackLanguage: req.Config.FallbackLanguage,
		Size:             string(req.Config.Size),
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
// for a series-episode request so ratings resolve per-episode. The second string
// names the provider whose artwork was actually used, which is not always the
// configured source: a source that cannot serve this id falls through to the
// next, and the ratings pass must not skip a source that never answered.
func (p *Pipeline) fetchSourceImageAndMeta(ctx context.Context, req Request) (_ []byte, _ *provider.MediaMeta, _ string, _ string, err error) {
	// The fetch timeout below bounds one HTTP request, and this stage tries one
	// per provider, so a title whose sources all hang costs as many timeouts as
	// there are providers and holds a render slot for the sum. The stage gets
	// its own bound: twice the per-fetch budget, which lets one slow source be
	// answered by the next provider without letting a dead one be tried by all
	// of them.
	parent := ctx
	var stageCtx context.Context
	if d := p.artStageTimeout(); d > 0 {
		var cancel context.CancelFunc
		stageCtx, cancel = context.WithTimeout(ctx, d)
		defer cancel()
		ctx = stageCtx
	}
	// A stage we cut short is a statement about us, not about the title, and the
	// caller treats the two differently. The parent is checked as well, because
	// a caller that gave up is neither.
	defer func() {
		if err != nil && stageCtx != nil &&
			stageCtx.Err() == context.DeadlineExceeded && parent.Err() == nil {
			err = fmt.Errorf("%w: %w", errArtStageDeadline, err)
		}
	}()
	// Series-episode requests (thumbnails from AIOMetadata) resolve the episode
	// still + per-episode ratings instead of the series-level artwork.
	if series, season, episode, ok := parseEpisodeID(req.MediaID); ok {
		if data, meta, ratingID, handled := p.fetchEpisode(ctx, req, series, season, episode); handled {
			// The episode still comes from TMDB whatever the configured source is.
			return data, meta, ratingID, "tmdb", nil
		}
		// Not handled means the still was skipped — episodeArtworkMode "series",
		// or TMDB having none — and the series artwork is what stands in. Every
		// source below is keyed on titles, so carrying the episode id here asks
		// all of them for something none of them has and ends as a placeholder.
		req.MediaID = series
	}
	opts := provider.ArtworkOptions{
		Language:           req.Config.Language,
		FallbackLanguage:   req.Config.FallbackLanguage,
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
	var baseFrom string
	order := p.artworkOrderFor(string(req.Config.ArtworkSource), req.MediaType, req.MediaID)
	knownID, knownType := p.identify(ctx, req, order)
	contentType := req.ContentType
	if contentType == "" {
		contentType = knownType
	}
	for _, name := range order {
		prov := p.providers.Get(name)
		if prov == nil {
			continue
		}
		if !providerReady(prov) {
			continue
		}
		// Kitsu is keyed on its own ids, so a mainstream id reaches it only
		// through the anime map. A title with no mapping is not an anime Kitsu
		// knows, and the next source in the order covers it.
		providerID := req.MediaID
		if name == string(imageconfig.ArtworkKitsu) {
			id, ok := p.kitsuID(ctx, req)
			if !ok {
				p.log().DebugContext(ctx, "No Kitsu id is mapped for this title, so Kitsu is skipped",
					"id", logging.RequestID(ctx), "media_id", req.MediaID)
				continue
			}
			p.log().DebugContext(ctx, "Resolved the title to a Kitsu id",
				"id", logging.RequestID(ctx), "media_id", req.MediaID, "kitsu_id", id)
			providerID = id
		}
		// MediUX is keyed on the numeric TMDB id, so a tt-id is resolved first.
		// A title that cannot be resolved falls through to the next source.
		if name == string(imageconfig.ArtworkMediux) {
			id, ok := p.tmdbNumericID(ctx, req, knownID)
			if !ok {
				p.log().DebugContext(ctx, "No numeric TMDB id was resolved for this title, so MediUX is skipped",
					"id", logging.RequestID(ctx), "media_id", req.MediaID)
				continue
			}
			p.log().DebugContext(ctx, "Resolved the title to a numeric TMDB id",
				"id", logging.RequestID(ctx), "media_id", req.MediaID, "tmdb_id", id)
			providerID = id
		}
		var meta *provider.MediaMeta
		var err error
		// Providers are queried by content type (movie/series), never by the
		// artwork surface; the surface only decides which image URL we pick.
		if af, ok := prov.(provider.ArtworkFetcher); ok {
			// An id from a source already consulted lets the next one verify that
			// its own lookup landed on the same work, without spending a call.
			srcOpts := opts
			srcOpts.TMDBID = knownID
			if baseMeta != nil && baseMeta.TMDBID != "" {
				srcOpts.TMDBID = baseMeta.TMDBID
			}
			meta, err = af.FetchArtwork(ctx, contentType, providerID, srcOpts)
		} else {
			meta, err = prov.Fetch(ctx, contentType, providerID)
		}
		if err != nil || meta == nil {
			p.log().DebugContext(ctx, "A metadata provider returned no result",
				"id", logging.RequestID(ctx),
				"provider", name, "media_type", req.MediaType, "media_id", req.MediaID,
				"error", err)
			continue
		}
		if baseMeta == nil {
			// Copied at the provider boundary: a provider may hand the same
			// object to concurrent renders of one title, and everything below
			// writes into this one.
			local := *meta
			baseMeta, baseFrom = &local, name
		} else {
			mergeArtworkURLs(baseMeta, meta)
		}
		// Strict per-surface selection: no logo→poster substitution yet, so the
		// loop keeps trying other providers for a real logo first.
		if url := selectSurfaceURL(meta, req.MediaType, req.Config); url != "" {
			url = p.posterURLFor(ctx, meta, url)
			if data, ferr := p.fetcher.Fetch(ctx, url); ferr == nil && len(data) > 0 {
				data = p.betterPoster(ctx, req, meta, url, data)
				p.enrichMetaForOverlays(ctx, req, baseMeta)
				return data, baseMeta, req.MediaID, name, nil
			}
		}
	}
	if baseMeta == nil {
		return nil, nil, req.MediaID, "", fmt.Errorf("no artwork provider returned metadata")
	}
	// No provider had the exact surface. Last resort allows a poster to stand in
	// for a missing logo/thumbnail, using art merged from every source tried.
	p.enrichMetaForOverlays(ctx, req, baseMeta)
	if url := selectArtworkURL(baseMeta, req.MediaType, req.Config); url != "" {
		if data, err := p.fetcher.Fetch(ctx, url); err == nil && len(data) > 0 {
			return data, baseMeta, req.MediaID, baseFrom, nil
		}
	}
	return nil, baseMeta, req.MediaID, baseFrom, fmt.Errorf("no artwork URL in metadata")
}

// identify asks an id-authoritative source what MediaID actually resolves to.
//
// Fanart is matched through a third-party id index that carries wrong tt-ids,
// so when it answers before any other source there is nothing to check its
// record against. One lookup buys both the id and the content type. Sources
// that resolve ids themselves need neither, so nothing is spent on them.
func (p *Pipeline) identify(ctx context.Context, req Request, order []string) (tmdbID, contentType string) {
	if !strings.HasPrefix(req.MediaID, "tt") && !strings.HasPrefix(req.MediaID, "tvdb:") {
		return "", ""
	}
	if firstReady(p.providers, order) != "fanart" {
		return "", ""
	}
	tmdb := p.providers.Get("tmdb")
	if tmdb == nil || !providerReady(tmdb) {
		return "", ""
	}
	ident, ok := tmdb.(provider.TitleIdentifier)
	if !ok {
		return "", ""
	}
	tmdbID, contentType, err := ident.IdentifyID(ctx, req.MediaID, req.ContentType)
	if err != nil {
		p.log().DebugContext(ctx, "Could not identify the title before fetching artwork",
			"id", logging.RequestID(ctx), "media_id", req.MediaID, "error", err)
		return "", ""
	}
	return tmdbID, contentType
}

// firstReady names the first provider in order that can be queried.
func firstReady(reg *provider.Registry, order []string) string {
	for _, name := range order {
		if prov := reg.Get(name); prov != nil && providerReady(prov) {
			return name
		}
	}
	return ""
}

// artworkOrder lists providers to try for artwork: the configured source first,
// then the remaining image-capable providers as fallbacks. Providers not
// registered (e.g. Fanart without an API key) are skipped by the caller.
func (p *Pipeline) artworkOrder(primary, surface string) []string {
	return p.artworkOrderFor(primary, surface, "")
}

// artworkOrderFor is artworkOrder with the media id in hand. Kitsu answers only
// for its own ids and is not in the fallback list, so a kitsu: id needs it added.
func (p *Pipeline) artworkOrderFor(primary, surface, mediaID string) []string {
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
	if strings.HasPrefix(mediaID, "kitsu:") && primary != string(imageconfig.ArtworkKitsu) {
		order = append([]string{string(imageconfig.ArtworkKitsu)}, order...)
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
// providers, stinger) from TMDB when the artwork source doesn't supply it.
// Without this, switching artwork to fanart/cinemeta would silently drop the
// age/genre/provider/stinger badges even though the data exists.
func (p *Pipeline) enrichMetaForOverlays(ctx context.Context, req Request, meta *provider.MediaMeta) {
	needsRating := req.Config.AgeRating && meta.ContentRating == ""
	needsGenres := req.Config.Genre && len(meta.Genres) == 0
	needsProviders := req.Config.Providers && len(meta.WatchProviders) == 0
	// Stinger is read from TMDB's keywords, so any other artwork source leaves it
	// empty and the badge never draws.
	needsStinger := req.Config.Stinger && !meta.Stinger.Has()
	if !needsRating && !needsGenres && !needsProviders && !needsStinger {
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
	if needsStinger {
		meta.Stinger = extra.Stinger
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

	// The source is often already the output size: a TMDB w780 poster is exactly
	// the 780x1170 a poster render wants. Interpolating that costs as much as a
	// real resize and changes nothing, so hand it back untouched.
	if srcW == maxW && srcH == maxH {
		if n, ok := src.(*image.NRGBA); ok {
			return n
		}
		exact := image.NewNRGBA(image.Rect(0, 0, maxW, maxH))
		draw.Draw(exact, exact.Bounds(), src, srcB.Min, draw.Src)
		return exact
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
// non-artwork provider that returned data (for TTL selection), and whether any
// source failed outright with nothing remembered to stand in for it.
//
// A source that answers with no rating is not degraded: most titles genuinely
// lack a score on most sources, and treating that as a failure would put every
// render on the short TTL.
// The third and fourth results are whether the render lost a wanted source, and
// whether any of those losses was the source's own doing rather than one of our
// gates.
func (p *Pipeline) collectRatingsWithProviders(ctx context.Context, req Request, artwork *provider.MediaMeta) ([]provider.Rating, []string, bool, bool, bool, []string) {
	if artwork == nil {
		artwork = &provider.MediaMeta{}
	}
	all := make([]provider.Rating, len(artwork.Ratings))
	copy(all, artwork.Ratings)
	seen := make(map[string]bool, len(all))
	for _, r := range all {
		seen[r.Source] = true
	}

	// Several providers can supply the same source: MDBList carries a Trakt
	// score and so does Trakt. Whichever answer is merged first is the one the
	// badge shows, so the merge runs in provider-name order after every call has
	// returned rather than in the order the network happened to answer.
	var wg sync.WaitGroup
	var contributors []string
	// Skip the provider that actually supplied the artwork, not the one that was
	// configured to. A source that cannot serve this id — Cinemeta given a raw
	// episode id — fails, the fallback supplies the artwork, and skipping the
	// configured source anyway drops a rating it could have answered for, since
	// the ratings pass queries by a resolved id rather than the artwork one.
	// Before the artwork is fetched artworkFrom is empty, so nothing is skipped.
	artworkSource := req.artworkFrom
	var called []provider.Provider
	for _, name := range p.providers.Names() {
		if name != "" && name == artworkSource {
			continue
		}
		prov := p.providers.Get(name)
		if prov == nil {
			continue
		}
		if !providerReady(prov) {
			continue
		}
		if !providerWanted(prov, req.Config, req.ContentType) {
			continue
		}
		called = append(called, prov)
	}

	answers := make([]*provider.MediaMeta, len(called))
	var degraded, sourceFault, queueHeld atomic.Bool
	degradedFlags := make([]bool, len(called))

	// A supplier that costs nothing to consult is asked before the rest. Where
	// it has the title, the sources it answered for need no other supplier and
	// theirs are never called. Where it does not, nothing has been spent and
	// every supplier runs as before — coverage is per title, so which of the two
	// it is cannot be known until it has answered.
	done := make(map[int]bool)
	covered := make(map[string]bool)
	for _, i := range freePreferredSuppliers(called, req.Config, req.ContentType) {
		prov := called[i]
		if !provider.SourceApplies(ctx, prov, req.ContentType, req.MediaID) {
			continue
		}
		started := time.Now()
		meta, fromMemory, err := p.fetchRatingsResilient(ctx, prov, req, artwork)
		// Logged exactly as a source in the fan-out is. A supplier consulted on
		// a different path and left out of the record is invisible, and a render
		// where it answered cannot be told from one where it was never asked.
		switch {
		case err != nil:
			p.log().DebugContext(ctx, "A ratings source did not answer",
				"id", logging.RequestID(ctx), "source", prov.Name(),
				"media_id", req.MediaID, "took_ms", time.Since(started).Milliseconds(),
				"error", err)
		case fromMemory:
		default:
			p.log().InfoContext(ctx, "A ratings source answered",
				"id", logging.RequestID(ctx), "source", prov.Name(),
				"media_id", req.MediaID, "took_ms", time.Since(started).Milliseconds(),
				"ratings", len(ratingsOf(meta)))
		}
		if err != nil || meta == nil {
			continue
		}
		answers[i] = meta
		done[i] = true
		for _, r := range meta.Ratings {
			covered[strings.ToLower(r.Source)] = true
		}
	}
	skip := redundantAfter(called, covered, req.Config, req.ContentType, done)
	if len(skip) > 0 {
		p.log().InfoContext(ctx, "Skipped rating suppliers a free source already answered for",
			"id", logging.RequestID(ctx), "media_id", req.MediaID, "skipped", len(skip))
	}

	for i, prov := range called {
		if done[i] || skip[i] {
			continue
		}
		wg.Add(1)
		go func(i int, prov provider.Provider) {
			defer wg.Done()
			// What a source can answer for is settled before whether it is
			// available. Every hold-out gate lives inside fetchRatingsResilient,
			// and a gate marks what it refuses as degraded, which puts a
			// placeholder on the poster. A source that cannot apply to this
			// title is not a source the render lost.
			//
			// Asked here rather than where the provider list is built: a mapping
			// lookup can reach a live API for a title the local dataset misses,
			// and in front of the fan-out that would serialise one network call
			// per anime source before any source is called at all.
			if !provider.SourceApplies(ctx, prov, req.ContentType, req.MediaID) {
				p.log().DebugContext(ctx, "A ratings source does not apply to this title",
					"id", logging.RequestID(ctx), "source", prov.Name(),
					"media_id", req.MediaID)
				return
			}
			started := time.Now()
			meta, fromMemory, err := p.fetchRatingsResilient(ctx, prov, req, artwork)
			// Info, because a held-out source is only meaningful against the
			// number of renders that reached the source at all. Without it a
			// window with no warning is indistinguishable from a window that
			// asked for nothing. Logged only where the source did answer, so
			// the count means what its name says.
			switch {
			case err != nil:
				p.log().DebugContext(ctx, "A ratings source did not answer",
					"id", logging.RequestID(ctx), "source", prov.Name(),
					"media_id", req.MediaID, "took_ms", time.Since(started).Milliseconds(),
					"error", err)
			case fromMemory:
				// Already logged where the memory was read, with the gate and
				// the age. Logging it here as well would count it as an answer.
			default:
				p.log().InfoContext(ctx, "A ratings source answered",
					"id", logging.RequestID(ctx), "source", prov.Name(),
					"media_id", req.MediaID, "took_ms", time.Since(started).Milliseconds(),
					"ratings", len(ratingsOf(meta)))
			}
			if err != nil {
				// Only a throttled source counts. A scraped source reports "no
				// match" as an error too, and that is a permanent fact about the
				// title rather than something a later render would find.
				if errors.Is(err, provider.ErrRateLimited) {
					degraded.Store(true)
					degradedFlags[i] = true
					// The per-request drop is otherwise invisible: the badge is
					// gone from the poster and only a debug line records why, so a
					// source missing from most renders leaves no warn to act on.
					// "gate" names which of the four hold-out paths fired; only
					// upstream_refusal means the source refused this request.
					gate := provider.HoldOutGate(err)
					if !provider.GateIsOurOwn(gate) {
						sourceFault.Store(true)
					}
					if provider.GateIsAQueue(gate) {
						queueHeld.Store(true)
					}
					// Whose allowance was spent, on every gate rather than only
					// the paced ones. On an upstream refusal it is the field that
					// separates a visitor's own exhausted key from ours, and
					// reconstructing it afterwards means joining request ids back
					// to their query strings.
					attrs := []any{"id", logging.RequestID(ctx), "source", prov.Name(),
						"media_id", req.MediaID, "gate", gate,
						"outcome", outcomeHeldOut,
						"owner_keyed", provider.HasOwnerKey(ctx, prov.Name())}
					if gate == provider.GatePacerBacklog {
						attrs = append(attrs, "min_interval_ms",
							provider.PacedInterval(prov.Name()).Milliseconds())
					}
					// Which constraint set the rate that refused. A spent day and
					// a configured ceiling produce the same gate and want opposite
					// responses.
					if reason := provider.HoldOutReason(err); reason != "" {
						attrs = append(attrs, "paced_by", reason)
					}
					// Says what happened rather than what might. Every gate
					// reaches this line only with an empty remembered store, by
					// one of two routes: cooldown and bulk_allowance consult the
					// store before the gate and return early on a hit, and the
					// rest consult it after the fetch and return there. Naming
					// the possibility asserted something nothing had checked.
					p.log().WarnContext(ctx, "A ratings source was held out and did not answer; its badge is left empty",
						attrs...)
					// Counted as well as logged: the log holds minutes, and the
					// question "how many renders lost a rating today" needs an
					// answer that outlives the window.
					p.health.NoteHeldOutEmpty(prov.Name(), gate,
						provider.HasOwnerKey(ctx, prov.Name()))
				}
				return
			}
			if meta == nil {
				return
			}
			answers[i] = meta
		}(i, prov)
	}
	wg.Wait()

	// Which provider supplies a source is a preference, not the order the
	// registry happens to sort names in. Resolved per source, because a
	// provider can be the preferred supplier of one and not of another.
	winner := preferredSuppliers(called, answers)

	for i, meta := range answers {
		if meta == nil {
			continue
		}
		// The rank arrives from whichever provider computes it, not from the
		// artwork source, so carry it across onto the meta the badges read.
		if meta.TopRatedRank > 0 && artwork.TopRatedRank == 0 {
			artwork.TopRatedRank = meta.TopRatedRank
		}
		fillContentRating(artwork, meta.ContentRating)
		if meta.Awards.Has() && !artwork.Awards.Has() {
			artwork.Awards = meta.Awards
		}
		contributed := false
		for _, r := range meta.Ratings {
			if w, ok := winner[r.Source]; ok && w != called[i].Name() {
				continue
			}
			if !seen[r.Source] {
				seen[r.Source] = true
				all = append(all, r)
				contributed = true
			}
		}
		if contributed {
			contributors = append(contributors, called[i].Name())
		}
	}
	var degradedSources []string
	for i, f := range degradedFlags {
		if f {
			degradedSources = append(degradedSources, called[i].Name())
		}
	}
	return all, contributors, degraded.Load(), sourceFault.Load(), queueHeld.Load(), degradedSources
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
