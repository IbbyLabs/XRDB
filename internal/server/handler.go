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
}

// NewHandler builds the HTTP mux. Pass a non-nil staticFS to serve an embedded
// frontend (SPA) at the root; nil disables static file serving.
func NewHandler(version string, store *profile.Store, settingsStore *settings.Store, pipeline *compose.Pipeline, renderCache *cache.Cache, cfg config.Config, staticFS ...fs.FS) http.Handler {
	ms := metrics.New()
	logger := slog.Default()
	mux := http.NewServeMux()
	renderLimiter := newConcurrencyLimiter(cfg.RenderConcurrency)
	ttls := newTTLStore(cfg.ProviderTTLs)
	ttls.setDegradedTTL(cfg.DegradedCacheTTL)
	notFound := newNotFoundCache(cfg.NotFoundTTL)
	// Forwarded headers are client input unless the peer is a known proxy.
	trust := newProxyTrust(cfg.TrustedProxies, cfg.TrustProxyHeaders)

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, statusResponse{Service: "xrdb-api", Status: "ok", Version: version})
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
				if p, err := store.Resolve(configParam); err == nil {
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
		reqContentType := normalizeContentType(queryValue(raw, "type", ""))
		if imageconfig.HasPerTypeRatings(imgCfg) || imageconfig.HasPerTypeArtwork(imgCfg) {
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
		if renderCache != nil {
			if e, ok := renderCache.Get(cacheKey); ok {
				pngBytes = e.Data
				fromCache = true
				expiresAt = e.ExpiresAt
			}
		}
		placeholder := false
		// queueWaitMs stays zero for a cache hit or a remembered not-found, neither
		// of which touches the render limiter.
		var queueWaitMs int64
		if !fromCache && notFound.Has(cacheKey) {
			// Asked for recently and there was nothing. Answer from that rather
			// than sweeping every provider again, which is what makes a
			// catalogue of a title with no art cost one sweep per episode.
			pngBytes = render.PlaceholderPNG(mediaType)
			placeholder = true
		}
		if !fromCache && !placeholder {
			// A render costs the budget in proportion to its output size, so a
			// burst of 4K posters cannot take every slot at the price of one.
			weight := renderWeight(imgCfg.Size)
			// Only real renders are gated; cache hits above pass freely, so a
			// warm catalogue reload isn't throttled. If the client hangs up or
			// the request times out while queued, drop it without spending a slot.
			queueStart := time.Now()
			if !renderLimiter.acquireWithin(r.Context(), cfg.RenderQueueWait, weight) {
				// Either the caller gave up, or the queue is deeper than the
				// render throughput can clear. Turning the request away keeps the
				// wait bounded for everyone behind it; a caller that has cached
				// art of its own falls back to it rather than showing a gap.
				waitedMs := time.Since(queueStart).Milliseconds()
				if r.Context().Err() != nil {
					logger.DebugContext(r.Context(), "Render abandoned by the caller while queued",
						"id", logging.RequestID(r.Context()),
						"media_type", mediaType, "media_id", id, "waited_ms", waitedMs)
					ms.Record("/"+mediaType, 499, latMs(start))
					return
				}
				logger.WarnContext(r.Context(), "Shed a render because the queue was full",
					"id", logging.RequestID(r.Context()),
					"media_type", mediaType, "media_id", id, "waited_ms", waitedMs)
				w.Header().Set("Retry-After", "5")
				w.Header().Set("Cache-Control", "no-store")
				http.Error(w, "busy: too many renders queued", http.StatusServiceUnavailable)
				ms.Record("/"+mediaType, http.StatusServiceUnavailable, latMs(start))
				return
			}
			queueWaitMs = time.Since(queueStart).Milliseconds()
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
					contentType = renderResult.ContentType
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
			if placeholder {
				notFound.Remember(cacheKey)
			} else {
				// Artwork appeared, so stop answering from the remembered gap.
				notFound.Forget(cacheKey)
			}
			if !placeholder {
				ttl := effectiveTTL(renderResult, ttls)
				if renderCache != nil {
					_ = renderCache.SetWithTTL(cacheKey, pngBytes, ttl)
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
		status := http.StatusOK
		if !placeholder {
			// The cache key is a digest of everything that determines these
			// bytes, so it doubles as a strong validator.
			etag := `"` + cacheKey + `"`
			w.Header().Set("ETag", etag)
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
		logger.DebugContext(r.Context(), "Served an artwork render",
			"id", logging.RequestID(r.Context()),
			"media_type", mediaType, "media_id", id,
			"status", status, "from_cache", fromCache, "placeholder", placeholder,
			"bytes", len(pngBytes), "latency_ms", int64(latMs(start)), "queue_wait_ms", queueWaitMs)
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

	registerProfileRoutes(mux, store, cfg)
	registerMediaRoutes(mux, pipeline)
	registerAIOMRoutes(mux)
	registerAdminRoutes(mux, ms, cfg, settingsStore, pipeline, renderCache, ttls)

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

// statusRecorder captures the response status and byte count for access logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
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
		logger.LogAttrs(r.Context(), slog.LevelInfo, "Handled an HTTP request",
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
		)
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
