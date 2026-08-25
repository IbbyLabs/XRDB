package server

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/metrics"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
	"xrdb_rewrite/internal/settings"
	"xrdb_rewrite/internal/templates"
)

type statusResponse struct {
	Service string `json:"service"`
	Status  string `json:"status"`
	Version string `json:"version"`
	// Features reports what the process enabled, not what was asked for. A
	// feature whose dependency is missing reads false here.
	Features map[string]bool `json:"features,omitempty"`
}

// ranksTitles is the part of a provider that reports its ranking state.
type ranksTitles interface{ TopRatedReady() bool }

// effectiveFeatures reports the features the process actually turned on.
//
// imdbTopRated says the ranking is switched on; imdbTopRatedReady says renders
// are carrying it. They differ while the first build runs, and stay different
// when it fails.
func effectiveFeatures(cfg config.Config, pipeline *compose.Pipeline) map[string]bool {
	on := cfg.IMDbTopRated && cfg.IMDbDatasetDir != ""
	ready := false
	if on && pipeline != nil {
		if p, ok := pipeline.Provider("imdb_local").(ranksTitles); ok {
			ready = p.TopRatedReady()
		}
	}
	return map[string]bool{
		"imdbDataset":       cfg.IMDbDatasetDir != "",
		"imdbTopRated":      on,
		"imdbTopRatedReady": ready,
	}
}

// NewHandler builds the HTTP mux. Pass a non-nil staticFS to serve an embedded
// frontend (SPA) at the root; nil disables static file serving.
func NewHandler(version string, store *profile.Store, settingsStore *settings.Store, pipeline *compose.Pipeline, renderCache *cache.Cache, cfg config.Config, staticFS ...fs.FS) http.Handler {
	ms := metrics.New()
	logger := slog.Default()
	mux := http.NewServeMux()
	// The budget is in weight units and a normal poster costs weightUnit of
	// them, so RenderConcurrency keeps meaning how many of those run at once.
	renderLimiter := newConcurrencyLimiter(cfg.RenderConcurrency * weightUnit)
	// Refuses at the door rather than after the queue: a request turned away by
	// the concurrency limiter has already waited the full queue window for its
	// refusal, which is a worse answer than the same refusal given at once.
	callerCap := newCallerLimiter(cfg.RenderCapPerMinute)
	sharedAliases := make(map[string]bool, len(cfg.SharedProfileAliases))
	for _, a := range cfg.SharedProfileAliases {
		sharedAliases[strings.ToLower(a)] = true
	}
	ttls := newTTLStore(cfg.ProviderTTLs)
	ttls.setDegradedTTL(cfg.DegradedCacheTTL)
	ttls.setHeldOutTTL(cfg.HeldOutCacheTTL)
	ttls.setQueueHeldTTL(cfg.QueueHeldCacheTTL)
	notFound := newNotFoundCache(cfg.NotFoundTTL)
	// Concurrent requests for one key share a render instead of each taking a
	// queue slot to produce the same bytes.
	flight := newRenderFlight()
	// Forwarded headers are client input unless the peer is a known proxy.
	trust := newProxyTrust(cfg.TrustedProxies, cfg.TrustProxyHeaders)

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, statusResponse{Service: "xrdb-api", Status: "ok", Version: version, Features: effectiveFeatures(cfg, pipeline)})
	})

	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, statusResponse{Service: "xrdb-api", Status: "ready", Version: version})
	})

	// Register each valid media type explicitly so SPA routes like /admin/{id}
	// are not captured by a generic wildcard.
	renderHandler := func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		// HEAD is how a client checks a poster exists. net/http discards the body
		// for it, so the same path serves both.
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			ms.Record(r.URL.Path, http.StatusMethodNotAllowed, latMs(start))
			return
		}
		// Extract the first path segment as media type (e.g. "poster" from "/poster/tt123").
		mediaType := strings.TrimPrefix(r.URL.Path, "/")
		if i := strings.Index(mediaType, "/"); i >= 0 {
			mediaType = mediaType[:i]
		}
		// Artwork URLs configured against v2 carry a file extension, and
		// sometimes an "imdb:" prefix, on the id segment.
		id := normalizeLegacyMediaID(r.PathValue("id"))
		raw := r.URL.RawQuery
		configParam := queryValue(raw, "config", "default")
		uuid := queryValue(raw, "uuid", "none")

		// Enforce global API key if configured. Accept via Authorization: Bearer
		// header or ?key= query param (for Stremio compatibility). The
		// configurator's own preview <img> is exempt — see sameOriginRender.
		if cfg.APIKey != "" && !bearerMatches(r, cfg.APIKey) && !keyParamMatches(raw, cfg.APIKey) && !sameOriginRender(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			ms.Record(r.URL.Path, http.StatusUnauthorized, latMs(start))
			return
		}

		// Resolve profile config if a profile ID is provided.
		// profileLoaded tracks whether we loaded a real profile (affects cache key).
		imgCfg := imageconfig.Default()
		profileLoaded := false
		// A change to the owner's provider keys changes the render (a working key
		// makes a source available that was not), so it has to move the cache key.
		// The config bytes do not carry the keys, so a fingerprint of them joins
		// the key explicitly. Empty when no owner keys apply.
		ownerKeyFP := ""
		// Empty for an inline config, which carries no profile at all, and for a
		// shared alias. Either way the caller is held to its address instead.
		capProfileKey := ""
		if configParam != "default" {
			if len(configParam) > 0 && configParam[0] == '{' {
				// Inline JSON config — used by the live preview without a saved profile.
				imgCfg = imageconfig.ParseSurface(json.RawMessage(configParam), mediaType)
				profileLoaded = true
				// The preview renders unsaved edits as inline JSON, so it carries
				// no profile to attach provider keys from. When editing a saved
				// profile the configurator names it in ?pk= purely so its stored
				// keys apply here, and the preview reflects what the owner set.
				// Gated to the same-origin preview: borrowing another profile's
				// keys for an arbitrary config would spend its metered allowance.
				if store != nil && sameOriginRender(r) {
					if pk := queryValue(raw, "pk", ""); pk != "" {
						if p, err := store.Resolve(pk); err == nil && len(p.ProviderKeys) > 0 {
							r = r.WithContext(provider.WithKeys(r.Context(), p.ProviderKeys))
							ownerKeyFP = provider.KeysFingerprint(p.ProviderKeys)
						}
					}
				}
			} else if store != nil {
				// configParam may be a profile ID or a memorable alias.
				// Rendering is intentionally public: artwork URLs are pasted
				// into media apps that can't send credentials. The profile
				// password protects editing (PUT/DELETE), not viewing.
				p, err := store.Resolve(configParam)
				if err != nil {
					// Rendering the default here is deliberate: a poster URL
					// carrying a deleted profile is pasted into a media app, and
					// breaking the artwork is worse than showing something. But
					// saying nothing made a working feature look broken — every
					// unrecognised value renders byte-identically, so a caller
					// reads "the parameter is ignored" as "the setting does
					// nothing". An inline config must start with '{'; anything
					// else is looked up as an id or alias.
					logger.WarnContext(r.Context(), "The requested config could not be resolved; rendering the default",
						"id", logging.RequestID(r.Context()), "config", configParam, "error", err)
				}
				if err == nil {
					// The canonical id rather than what the caller typed: an
					// alias and the id it resolves to are one profile, and
					// alternating them must not buy a second allowance.
					// A profile several people share is capped by address
					// instead, since a limit on it would hit a crowd.
					if !sharedAliases[strings.ToLower(configParam)] && !sharedAliases[strings.ToLower(p.ID)] {
						capProfileKey = "profile:" + p.ID
					}
					// A profile config can style each surface independently;
					// resolve the one for this request's media type.
					imgCfg = imageconfig.ParseSurface(p.Config, mediaType)
					profileLoaded = true
					// The owner's own provider credentials stand in for the
					// server's for their renders. They ride on the context so
					// the providers built at startup are reused as they are.
					if len(p.ProviderKeys) > 0 {
						r = r.WithContext(provider.WithKeys(r.Context(), p.ProviderKeys))
						ownerKeyFP = provider.KeysFingerprint(p.ProviderKeys)
					}
				}
			}
		}

		// A capped route renders smaller than the profile asked for, so the cap
		// is applied before the key is built rather than at encode time.
		if cap := sizeCapFrom(r.Context()); cap != "" {
			imgCfg.Size = imageconfig.ClampSize(imgCfg.Size, cap)
		}

		// Include a fingerprint of configParam when no profile was loaded so
		// different inline configs produce different cache keys without allowing
		// attackers to poison the cache with unbounded unique raw strings.
		cfgKeyInput := imageconfig.CacheKey(imgCfg)
		// A per-type override makes the render depend on the kind of title, so
		// the kind joins the key. Configs without one keep their existing keys.
		// A bare TMDB id joins it too: there the kind picks which endpoint
		// answers, so it selects the artwork rather than only styling it.
		reqContentType := normalizeContentType(queryValue(raw, "type", ""))
		if imageconfig.HasPerTypeRatings(imgCfg) || imageconfig.HasPerTypeArtwork(imgCfg) || idKindIsAmbiguous(id) {
			cfgKeyInput = cfgKeyInput + ":ct=" + reqContentType
		}
		if !profileLoaded {
			h := sha256.Sum256([]byte(configParam))
			cfgKeyInput = cfgKeyInput + ":" + hex.EncodeToString(h[:8])
		}
		if ownerKeyFP != "" {
			cfgKeyInput = cfgKeyInput + ":pk=" + ownerKeyFP
		}
		// Hash the cache-buster so unbounded user input can't inflate the key.
		if cb := queryValue(raw, "cb", ""); cb != "" {
			hcb := sha256.Sum256([]byte(cb))
			cfgKeyInput = cfgKeyInput + ":cb=" + hex.EncodeToString(hcb[:8])
		}
		cacheKey := render.CacheKey(mediaType, id, cfgKeyInput, uuid)
		var pngBytes []byte
		contentType := ""
		fromCache := false
		var expiresAt time.Time
		var degraded, degradedByUs bool
		if renderCache != nil {
			if e, ok := renderCache.Get(cacheKey); ok {
				pngBytes = e.Data
				fromCache = true
				expiresAt = e.ExpiresAt
			}
		}
		// Why this response cost what it cost. Without it a cache hit and a fresh
		// render are one line apart in the log and only latency distinguishes
		// them, which is a guess at a threshold rather than a fact.
		if fromCache {
			w.Header().Set("X-Render-Source", "hit")
		}
		placeholder := false
		// A placeholder we produced by giving up is not evidence about the title,
		// so it is not remembered: the next request tries the source again rather
		// than being answered with our own impatience for the rest of the minute.
		placeholderIsOurs := false
		// queueWaitMs stays zero for a cache hit or a remembered not-found, neither
		// of which touches the render limiter. didQueue separates that from a
		// genuine zero wait.
		var queueWaitMs int64
		var didQueue bool
		if !fromCache && notFound.Has(cacheKey) {
			// Asked for recently and there was nothing. Answer from that rather
			// than sweeping every provider again, which is what makes a
			// catalogue of a title with no art cost one sweep per episode.
			pngBytes = render.PlaceholderPNG(mediaType)
			placeholder = true
			w.Header().Set("X-Render-Source", "gap")
		}
		// A render already under way for this key is waited on rather than
		// repeated. The wait is bounded by the caller's own context, so giving up
		// here costs the leader nothing.
		var flightCall *renderCall
		leadsFlight := true
		if !fromCache && !placeholder {
			flightCall, leadsFlight = flight.begin(cacheKey)
			if !leadsFlight {
				select {
				case <-flightCall.done:
					if flightCall.served {
						pngBytes = flightCall.bytes
						contentType = flightCall.contentType
						placeholder = flightCall.placeholder
						degraded = flightCall.degraded
						degradedByUs = flightCall.degradedByUs
						expiresAt = flightCall.expiresAt
						fromCache = true
						w.Header().Set("X-Render-Source", "flight")
						logger.DebugContext(r.Context(), "Served a render from one already in flight",
							"id", logging.RequestID(r.Context()),
							"media_type", mediaType, "media_id", id)
					}
				case <-r.Context().Done():
					markAbandoned(w)
					ms.Record("/"+mediaType, 499, latMs(start))
					return
				}
			}
		}
		if !fromCache && !placeholder {
			if leadsFlight {
				defer flight.finish(cacheKey, flightCall)
			}
			// A sweep that names itself is held by the queue's bulk ceiling,
			// which makes it wait rather than turning it away. The cap refuses
			// it before it reaches that ceiling, so a sweep is exempt here
			// (BUG-263). The allowance is not spent either: the address bucket
			// is shared with anyone behind the same address.
			//
			// This is the one site where being treated as a sweep LIFTS a
			// limit. A caller-class rule applied everywhere else must skip it,
			// or it hands the exemption to whichever class it meant to
			// restrain. provider.TreatedAsBulk is deliberately not used here.
			sweep := provider.CallerClassFrom(r.Context()) == provider.CallerBulk
			// Only fresh renders are counted. A warm catalogue reload costs a
			// cache read and is not what the queue is made of.
			ok, over := true, ""
			if !sweep {
				ok, over = callerCap.allow(capProfileKey, "ip:"+clientIP(r, trust))
			}
			if !ok {
				// The key names which allowance ran out. caller_class is an
				// invariant rather than a report: a recognised sweep is exempt
				// above, so "bulk" here means the exemption has broken.
				logger.InfoContext(r.Context(), "A caller asked for more renders than its allowance and was turned away",
					"id", logging.RequestID(r.Context()), "media_id", id,
					"over", over, "per_minute", cfg.RenderCapPerMinute,
					"caller_class", provider.CallerClassFrom(r.Context()).String())
				w.Header().Set("Retry-After", "60")
				w.Header().Set("Cache-Control", "no-store")
				http.Error(w, "too many renders; try again shortly", http.StatusTooManyRequests)
				// The metrics snapshot is the only view an operator has of what the
				// service did. A refusal absent from it reads as a quiet minute, and
				// a shed counted only where the queue is measured names the wrong
				// cause.
				ms.Record("/"+mediaType, http.StatusTooManyRequests, latMs(start))
				return
			}
			// A render costs the budget in proportion to what it draws, so a
			// burst of 4K posters cannot take every slot at the price of one,
			// and a thumbnail is not charged as if it were a poster.
			weight := renderWeight(mediaType, imgCfg.Size)
			// Only real renders are gated; cache hits above pass freely, so a
			// warm catalogue reload isn't throttled. If the client hangs up or
			// the request times out while queued, drop it without spending a slot.
			queueStart := time.Now()
			// A sweep is made to wait; a person is not. Shedding a request
			// somebody is looking at to admit one nobody is has it backwards.
			admitted := false
			// Which ceiling this request was given. A shed under the bulk ceiling
			// and one under the ordinary ceiling have different causes, and the
			// message alone cannot tell them apart.
			queueTier := "normal"
			switch {
			case provider.TreatedAsBulk(provider.CallerClassFrom(r.Context())):
				queueTier = "bulk"
				admitted = renderLimiter.acquireBulk(r.Context(), cfg.RenderQueueWaitBulk, weight)
			default:
				admitted = renderLimiter.acquireWithin(r.Context(), cfg.RenderQueueWait, weight)
			}
			if !admitted {
				// Either the caller gave up, or the queue is deeper than the
				// render throughput can clear. Turning the request away keeps the
				// wait bounded for everyone behind it; a caller that has cached
				// art of its own falls back to it rather than showing a gap.
				waitedMs := time.Since(queueStart).Milliseconds()
				heldWeight, budget := renderLimiter.occupancy()
				if r.Context().Err() != nil {
					logger.DebugContext(r.Context(), "Render abandoned by the caller while queued",
						"id", logging.RequestID(r.Context()),
						"media_type", mediaType, "media_id", id, "waited_ms", waitedMs,
						"queue_tier", queueTier)
					markAbandoned(w)
					ms.Record("/"+mediaType, 499, latMs(start))
					return
				}
				logger.WarnContext(r.Context(), "Shed a render because the queue was full",
					"id", logging.RequestID(r.Context()),
					"media_type", mediaType, "media_id", id, "waited_ms", waitedMs,
					"queue_tier", queueTier,
					// What this render cost the budget. Surface and size both
					// decide it, and neither is otherwise on this line, so
					// without it a shed count cannot be read against a change
					// in pricing.
					"weight", weight,
					// What the budget was holding when this was turned away.
					// Read from the limiter rather than inferred: the render
					// timing line is sampled, so reconstructing occupancy from
					// it covers a fraction of what was in flight.
					"held_weight", heldWeight, "budget", budget,
					// Both classes reach this line, so unlike on the cap refusal
					// this one varies and can be read (FR-196).
					"caller_class", provider.CallerClassFrom(r.Context()).String())
				w.Header().Set("Retry-After", "5")
				w.Header().Set("Cache-Control", "no-store")
				http.Error(w, "busy: too many renders queued", http.StatusServiceUnavailable)
				ms.Record("/"+mediaType, http.StatusServiceUnavailable, latMs(start))
				return
			}
			queueWaitMs = time.Since(queueStart).Milliseconds()
			didQueue = true
			if rec, ok := w.(*statusRecorder); ok {
				rec.queueWaitMs, rec.queued = queueWaitMs, true
			}
			w.Header().Set("X-Render-Source", "miss")
			var renderResult *compose.Result
			if pipeline != nil {
				renderResult, _ = pipeline.Render(r.Context(), compose.Request{
					MediaType:   mediaType,
					ContentType: reqContentType,
					MediaID:     id,
					Config:      imgCfg,
				})
				if renderResult != nil {
					pngBytes = renderResult.ImageBytes
					placeholder = renderResult.Placeholder
					placeholderIsOurs = renderResult.PlaceholderIsOurs
					contentType = renderResult.ContentType
					degraded = renderResult.Degraded
					degradedByUs = renderResult.DegradedByUs
					// Which source image this render drew (FR-194). A title can
					// have several candidates and the bytes alone cannot say
					// which was chosen; a cache hit draws nothing and sets none.
					if renderResult.ArtworkURL != "" {
						w.Header().Set("X-Artwork-Source", renderResult.ArtworkURL)
					}
				}
			}
			if len(pngBytes) == 0 {
				pngBytes = render.PlaceholderPNG(mediaType)
				placeholder = true
			}
			// Never cache a placeholder: a transient failure would otherwise be
			// frozen for the whole TTL, and downstream caches that key on a 200
			// (e.g. an nginx proxy_cache) would pin the broken image for as long
			// as they hold it. Only real artwork is cached.
			if placeholder && !placeholderIsOurs {
				notFound.Remember(cacheKey)
			} else {
				// Artwork appeared, so stop answering from the remembered gap.
				notFound.Forget(cacheKey)
			}
			// A degraded render is missing a wanted piece through a transient
			// failure. Storing it lets a later cache hit serve it with normal
			// freshness headers, since a hit does not recompute the degraded flag,
			// which is how one blip froze across a CDN for days. It is not stored
			// and carries no-store below, so every serve is a fresh attempt.
			if !placeholder && (!degraded || degradedByUs) {
				ttl := effectiveTTL(renderResult, ttls)
				if renderCache != nil {
					// A sweep's large renders are shed first: they are the one
					// class measured never to be re-read.
					if provider.TreatedAsBulk(provider.CallerClassFrom(r.Context())) {
						_ = renderCache.SetFromBulk(cacheKey, pngBytes, ttl)
					} else {
						_ = renderCache.SetWithTTL(cacheKey, pngBytes, ttl)
					}
					if ttl <= 0 {
						// Zero means "use the cache default"; resolve it so the
						// freshness we advertise matches the one we apply.
						ttl = renderCache.TTL()
					}
				}
				if ttl > 0 {
					expiresAt = time.Now().Add(ttl)
				}
			}
			// Hand the result to anyone waiting on this same key. Published
			// before the slot is freed so a waiter released by the next line
			// finds the fields already written.
			if leadsFlight && flightCall != nil {
				flightCall.bytes = pngBytes
				flightCall.contentType = contentType
				flightCall.placeholder = placeholder
				flightCall.degraded = degraded
				flightCall.degradedByUs = degradedByUs
				flightCall.expiresAt = expiresAt
				flightCall.served = len(pngBytes) > 0
			}
			// Free the slot before writing to the client so a slow consumer
			// doesn't hold a render slot for the duration of the download.
			renderLimiter.release(weight)
		}
		if contentType == "" {
			// Cache entries carry no format marker, and an entry written by an
			// earlier build may be PNG while this config now renders JPEG, so
			// read the format off the bytes rather than assuming it.
			contentType = render.SniffContentType(pngBytes)
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("X-Cache-Key", cacheKey)
		// Name the wanted rating sources this render skipped because they were
		status := http.StatusOK
		if !placeholder {
			// The cache key is a digest of everything that determines these
			// bytes, so it doubles as a strong validator.
			etag := `"` + cacheKey + `"`
			w.Header().Set("ETag", etag)
			if degraded && !degradedByUs {
				// Tell every layer at once — our cache, a CDN, the browser, the
				// client — not to hold a render known to be missing a piece. A
				// short TTL fixes only our side; no-store keeps a transient failure
				// from being frozen anywhere.
				w.Header().Set("Cache-Control", "no-store")
			} else {
				// Let downstream caches hold the render exactly as long as we will.
				// The URL carries a profile-version token (see profileVersionToken),
				// so an edited profile is a different URL and cannot be served stale
				// from a downstream cache.
				if maxAge := int(time.Until(expiresAt).Seconds()); maxAge > 0 {
					w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(maxAge))
				}
				if match := r.Header.Get("If-None-Match"); match != "" && etagMatches(match, etag) {
					w.Header().Set("X-Cache", "HIT")
					w.WriteHeader(http.StatusNotModified)
					ms.Record("/"+mediaType, http.StatusNotModified, latMs(start))
					return
				}
			}
		}
		if placeholder {
			// Signal "no artwork" with a non-cacheable 404 so caches/CDNs don't
			// store the fallback, and AIOMetadata's image proxy falls back to the
			// original art instead of serving the placeholder. The next request
			// retries and serves (and caches) real art once it's available.
			w.Header().Set("Cache-Control", "no-store")
			status = http.StatusNotFound
		} else if fromCache {
			w.Header().Set("X-Cache", "HIT")
		}
		w.WriteHeader(status)
		_, _ = w.Write(pngBytes)
		renderAttrs := []any{
			"id", logging.RequestID(r.Context()),
			"media_type", mediaType, "media_id", id,
			"status", status, "from_cache", fromCache, "placeholder", placeholder,
			"bytes", len(pngBytes), "latency_ms", int64(latMs(start)),
		}
		if didQueue {
			renderAttrs = append(renderAttrs, "queue_wait_ms", queueWaitMs)
		}
		logger.DebugContext(r.Context(), "Served an artwork render", renderAttrs...)
		ms.Record("/"+mediaType, status, latMs(start))
	}
	for _, mt := range imageconfig.Surfaces {
		mux.HandleFunc("/"+mt+"/{id}", renderHandler)
	}

	mux.HandleFunc("/render-placeholder", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		raw := r.URL.RawQuery
		mediaType := queryValue(raw, "type", "poster")
		id := queryValue(raw, "id", "tt0000000")
		config := queryValue(raw, "config", "default")
		uuid := queryValue(raw, "uuid", "none")
		simulate := queryValue(raw, "simulate", "0")
		key := render.CacheKey(mediaType, id, config, uuid)
		if level, ok := simulationLevel(simulate); ok {
			score := render.SimulateCompositionCostTier(mediaType, id, config, uuid, level)
			writeRenderPlaceholderJSONWithSimulation(w, mediaType, id, key, level, score)
			return
		}
		writeRenderPlaceholderJSON(w, mediaType, id, key)
	})

	registerProfileRoutes(mux, store, cfg, logger)
	registerMediaRoutes(mux, pipeline)
	registerAIOMRoutes(mux)
	registerAdminRoutes(mux, ms, cfg, settingsStore, pipeline, renderCache, ttls)

	// Genre families: GET /api/genre-families — the id, label and built-in
	// accent of every family, so the configurator's colour pickers read the
	// same table the renderer draws from.
	// Config defaults: GET /api/config/defaults. The configurator reads its
	// starting values from here rather than carrying its own copy, which drifted
	// from these on size, ratings order and ageRating.
	mux.HandleFunc("/api/config/defaults", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, imageconfig.Default())
	})

	mux.HandleFunc("/api/genre-families", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, compose.GenreFamilies())
	})

	// Templates: GET /api/templates — list all built-in templates.
	// GET /api/templates/{id} — single template by ID.
	mux.HandleFunc("/api/templates", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, templates.All())
	})
	mux.HandleFunc("/api/templates/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/api/templates/")
		if id == "" {
			writeJSON(w, http.StatusOK, templates.All())
			return
		}
		tmpl, ok := templates.ByID(id)
		if !ok {
			http.Error(w, "template not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, tmpl)
	})

	// ── Stremio addon endpoints ──────────────────────────────────────────────────
	// XRDB acts as a Stremio resource addon that serves enhanced artwork.
	// The addon only provides "meta" resources (no catalog, no streams).
	// Stremio consumers point their addon URL at /stremio/.
	//
	// GET /stremio/manifest.json
	// GET /stremio/meta/{type}/{id}.json
	registerStremioAddon(mux, cfg, store, trust)
	registerRPDBCompat(mux, imageconfig.ParseSize(cfg.RPDBMaxSize))
	registerMigrateRoutes(mux, cfg)
	registerFolderWriterRoutes(mux, cfg, pipeline, store)

	// Static file handler — registered last so API routes take precedence.
	if len(staticFS) > 0 && staticFS[0] != nil {
		mux.HandleFunc("/", staticFileHandler(staticFS[0]))
	}

	return accessLogMiddleware(logger, trust, corsMiddleware(rpdbIsValidMiddleware(store, mux)))
}

// markAbandoned records the 499 the render metrics already use for a caller that
// went away. Nothing is written to the response, and an unwritten status reads
// as 200 in the access log.
func markAbandoned(w http.ResponseWriter) {
	if rec, ok := w.(*statusRecorder); ok {
		rec.status = 499
	}
}

// statusRecorder captures the response status and byte count for access logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
	// queueWaitMs is set by the render path. Bursts complete in seconds, so
	// this rides the always-present access line rather than a sampled one.
	// queued distinguishes a genuine zero wait from a request that never
	// reached the queue at all; without it both read as 0.
	queueWaitMs int64
	queued      bool
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

// accessLogMiddleware assigns each request a correlation id, exposes it as
// X-Request-Id, and logs one line per request with method, path, status, and
// latency. Health and readiness probes are skipped to keep the log readable.
func accessLogMiddleware(logger *slog.Logger, trust proxyTrust, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		reqID := logging.NewRequestID()
		ctx := logging.WithRequestID(r.Context(), reqID)
		ctx = provider.WithCallerClass(ctx, provider.ClassifyUserAgent(r.UserAgent()))
		ctx = provider.WithCallerAgent(ctx, truncateUA(r.UserAgent()))
		w.Header().Set("X-Request-Id", reqID)
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r.WithContext(ctx))

		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			return
		}
		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		attrs := []slog.Attr{
			slog.String("id", reqID),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.String("query", logging.RedactQuery(r.URL.RawQuery)),
			slog.Int("status", status),
			slog.Int64("latency_ms", time.Since(start).Milliseconds()),
			slog.Int("bytes", rec.bytes),
			slog.String("client_ip", clientIP(r, trust)),
			// Which integration is driving the traffic. A catalogue crawl is
			// otherwise indistinguishable from ordinary use, and attributing one
			// took an hour of inference for want of this field.
			slog.String("user_agent", truncateUA(r.UserAgent())),
			// hit, flight, gap or miss: served from the render cache, from a
			// render already under way, from a remembered absence of artwork, or
			// composed here. Empty on anything that is not a render. Separate
			// from X-Cache, which is a public HIT marker downstream caches read.
			slog.String("render_source", rec.Header().Get("X-Render-Source")),
		}
		// Only when the request actually queued. A request served from cache
		// never waited, and reporting that as a zero puts it in the same bucket
		// as a render that found a slot immediately.
		if rec.queued {
			attrs = append(attrs, slog.Int64("queue_wait_ms", rec.queueWaitMs))
		}
		logger.LogAttrs(r.Context(), slog.LevelInfo, "Handled an HTTP request", attrs...)
	})
}

// truncateUA bounds the logged user agent. It is client-supplied, so an
// unbounded one would let a caller pad every log line at will.
func truncateUA(ua string) string {
	const max = 120
	if len(ua) > max {
		return ua[:max] + "…"
	}
	return ua
}

// corsMiddleware allows the web frontend to call the API cross-origin —
// required for split deployments (separate web container) and local dev,
// where the frontend runs on a different port than the API.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Profile-Password")
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// staticFileHandler serves an embedded SPA using a recording wrapper that
// intercepts 404s and applies Next.js-style resolution:
//  1. /_next/... and files with extensions → exact match or 404.html
//  2. /admin, /configurator → {slug}.html
//  3. Unknown extension-less paths → index.html (SPA fallback)
func staticFileHandler(fsys fs.FS) http.HandlerFunc {
	fileServer := http.FileServerFS(fsys)

	serveContent := func(w http.ResponseWriter, r *http.Request, name string) {
		f, err := fsys.Open(name)
		if err != nil {
			return
		}
		st, err := f.Stat()
		_ = f.Close()
		if err != nil {
			return
		}
		content, err := fsys.Open(name)
		if err != nil {
			return
		}
		rc, ok := content.(io.ReadSeekCloser)
		if !ok {
			_ = content.Close()
			return
		}
		defer rc.Close()
		w.Header().Set("Content-Type", mime(name))
		http.ServeContent(w, r, st.Name(), st.ModTime(), rc)
	}

	return func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")

		// Pass asset requests (contain a dot) directly to the file server.
		if strings.Contains(p, ".") {
			fileServer.ServeHTTP(w, r)
			return
		}

		// Root.
		if p == "" || p == "." {
			serveContent(w, r, "index.html")
			return
		}

		// Try {slug}.html (e.g. "admin" → "admin.html").
		if f, err := fsys.Open(p + ".html"); err == nil {
			_ = f.Close()
			serveContent(w, r, p+".html")
			return
		}

		// SPA fallback for unknown routes.
		serveContent(w, r, "index.html")
	}
}

func mime(name string) string {
	switch {
	case strings.HasSuffix(name, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(name, ".js"):
		return "application/javascript"
	case strings.HasSuffix(name, ".css"):
		return "text/css"
	case strings.HasSuffix(name, ".json"):
		return "application/json"
	case strings.HasSuffix(name, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(name, ".woff2"):
		return "font/woff2"
	case strings.HasSuffix(name, ".woff"):
		return "font/woff"
	case strings.HasSuffix(name, ".png"):
		return "image/png"
	case strings.HasSuffix(name, ".ico"):
		return "image/x-icon"
	default:
		return "application/octet-stream"
	}
}

// etagMatches reports whether an If-None-Match header selects the given ETag.
// The header is a comma-separated list, may be "*", and entries may carry the
// weak "W/" prefix — which we treat as a match, since the two forms only differ
// for byte-range requests and these responses are whole images.
func etagMatches(header, etag string) bool {
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" {
			return true
		}
		if strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}

func latMs(start time.Time) float64 {
	return float64(time.Since(start).Microseconds()) / 1000.0
}

// bearerMatches checks that the request carries "Authorization: Bearer <want>".
// Uses constant-time comparison to prevent timing attacks.
func bearerMatches(r *http.Request, want string) bool {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return false
	}
	got := auth[len("Bearer "):]
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// keyParamMatches checks that the ?key= query parameter equals want.
// Uses constant-time comparison to prevent timing attacks.
func keyParamMatches(rawQuery, want string) bool {
	got := queryValue(rawQuery, "key", "")
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// sameOriginRender reports whether a render request is the configurator's own
// preview loading in a browser, which the API-key gate exempts. XRDB_API_KEY
// exists to gate programmatic and external use — AIOMetadata and Stremio fetch
// server-side, hotlinks load cross-origin — and all of those still require the
// key. Sec-Fetch-Site is set by the browser and cannot be forged from page
// JavaScript; only a genuine same-origin request (the embedded <img>) is let
// through. same-site is intentionally not accepted, so a neighbour on a shared
// parent domain can't hotlink for free.
func sameOriginRender(r *http.Request) bool {
	switch r.Header.Get("Sec-Fetch-Site") {
	case "same-origin":
		return true
	case "same-site", "cross-site", "none":
		return false
	}
	// Clients that omit Fetch Metadata (older Safari) fall back to a same-host
	// Referer. Server-side fetchers send no Referer, so they stay gated.
	if ref := r.Header.Get("Referer"); ref != "" {
		if u, err := url.Parse(ref); err == nil && u.Host != "" {
			return u.Host == r.Host
		}
	}
	return false
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// idKindIsAmbiguous reports whether an id names a TMDB record without saying
// whether it is a film or a series. TMDB numbers /movie and /tv independently,
// so one number can hold a record under both.
func idKindIsAmbiguous(id string) bool {
	rest, ok := strings.CutPrefix(id, "tmdb:")
	if !ok || rest == "" {
		return false
	}
	for _, c := range rest {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// normalizeContentType maps a content-type hint from the request (the optional
// ?type= param emitted by the Stremio meta handler and the configurator) to a
// canonical "movie"|"series", or "" when absent/unknown. Artwork surface names
// are deliberately not treated as content types — that conflation is what made
// series posters/logos resolve as movies and drop most of their ratings.
func normalizeContentType(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "movie", "movies":
		return "movie"
	case "series", "tv", "show", "shows":
		return "series"
	default:
		return ""
	}
}

func writeRenderPlaceholderJSON(w http.ResponseWriter, mediaType, id, cacheKey string) {
	buf := make([]byte, 0, 200)
	buf = append(buf, '{')
	buf = append(buf, '"', 's', 'e', 'r', 'v', 'i', 'c', 'e', '"', ':')
	buf = strconv.AppendQuote(buf, "xrdb-api")
	buf = append(buf, ',')
	buf = append(buf, '"', 's', 't', 'a', 't', 'u', 's', '"', ':')
	buf = strconv.AppendQuote(buf, "render-placeholder")
	buf = append(buf, ',')
	buf = append(buf, '"', 't', 'y', 'p', 'e', '"', ':')
	buf = strconv.AppendQuote(buf, mediaType)
	buf = append(buf, ',')
	buf = append(buf, '"', 'i', 'd', '"', ':')
	buf = strconv.AppendQuote(buf, id)
	buf = append(buf, ',')
	buf = append(buf, '"', 'c', 'a', 'c', 'h', 'e', 'K', 'e', 'y', '"', ':')
	buf = strconv.AppendQuote(buf, cacheKey)
	buf = append(buf, '}')

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf)
}

func writeRenderPlaceholderJSONWithSimulation(w http.ResponseWriter, mediaType, id, cacheKey, level string, score uint64) {
	buf := make([]byte, 0, 240)
	buf = append(buf, '{')
	buf = append(buf, '"', 's', 'e', 'r', 'v', 'i', 'c', 'e', '"', ':')
	buf = strconv.AppendQuote(buf, "xrdb-api")
	buf = append(buf, ',')
	buf = append(buf, '"', 's', 't', 'a', 't', 'u', 's', '"', ':')
	buf = strconv.AppendQuote(buf, "render-placeholder")
	buf = append(buf, ',')
	buf = append(buf, '"', 't', 'y', 'p', 'e', '"', ':')
	buf = strconv.AppendQuote(buf, mediaType)
	buf = append(buf, ',')
	buf = append(buf, '"', 'i', 'd', '"', ':')
	buf = strconv.AppendQuote(buf, id)
	buf = append(buf, ',')
	buf = append(buf, '"', 'c', 'a', 'c', 'h', 'e', 'K', 'e', 'y', '"', ':')
	buf = strconv.AppendQuote(buf, cacheKey)
	buf = append(buf, ',')
	buf = append(buf, '"', 's', 'i', 'm', 'u', 'l', 'a', 't', 'e', 'd', '"', ':', 't', 'r', 'u', 'e')
	buf = append(buf, ',')
	buf = append(buf, '"', 's', 'i', 'm', 'u', 'l', 'a', 't', 'i', 'o', 'n', 'L', 'e', 'v', 'e', 'l', '"', ':')
	buf = strconv.AppendQuote(buf, level)
	buf = append(buf, ',')
	buf = append(buf, '"', 's', 'i', 'm', 'u', 'l', 'a', 't', 'i', 'o', 'n', 'S', 'c', 'o', 'r', 'e', '"', ':')
	buf = strconv.AppendUint(buf, score, 10)
	buf = append(buf, '}')

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf)
}

func queryValue(raw, key, fallback string) string {
	if raw == "" {
		return fallback
	}
	start := 0
	for start <= len(raw) {
		end := strings.IndexByte(raw[start:], '&')
		if end == -1 {
			end = len(raw)
		} else {
			end = start + end
		}
		pair := raw[start:end]
		if pair != "" {
			k, v, ok := strings.Cut(pair, "=")
			if !ok {
				if pair == key {
					return ""
				}
			} else if k == key {
				decoded, err := url.QueryUnescape(v)
				if err != nil {
					return v
				}
				return decoded
			}
		}
		if end == len(raw) {
			break
		}
		start = end + 1
	}
	return fallback
}

func simulationLevel(value string) (string, bool) {
	switch value {
	case "1", "true", "medium":
		return "medium", true
	case "light":
		return "light", true
	case "heavy":
		return "heavy", true
	default:
		return "", false
	}
}
