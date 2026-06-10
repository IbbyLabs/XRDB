package server

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
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
	"xrdb_rewrite/internal/metrics"
	"xrdb_rewrite/internal/profile"
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
	mux := http.NewServeMux()

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
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			ms.Record(r.URL.Path, http.StatusMethodNotAllowed, latMs(start))
			return
		}
		// Extract the first path segment as media type (e.g. "poster" from "/poster/tt123").
		mediaType := strings.TrimPrefix(r.URL.Path, "/")
		if i := strings.Index(mediaType, "/"); i >= 0 {
			mediaType = mediaType[:i]
		}
		id := r.PathValue("id")
		raw := r.URL.RawQuery
		configParam := queryValue(raw, "config", "default")
		uuid := queryValue(raw, "uuid", "none")

		// Enforce global API key if configured.
		// Accept via Authorization: Bearer header or ?key= query param (for Stremio compatibility).
		if cfg.APIKey != "" && !bearerMatches(r, cfg.APIKey) && !keyParamMatches(raw, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			ms.Record(r.URL.Path, http.StatusUnauthorized, latMs(start))
			return
		}

		// Resolve profile config if a profile ID is provided.
		// profileLoaded tracks whether we loaded a real profile (affects cache key).
		imgCfg := imageconfig.Default()
		profileLoaded := false
		if configParam != "default" {
			if len(configParam) > 0 && configParam[0] == '{' {
				// Inline JSON config — used by the live preview without a saved profile.
				imgCfg = imageconfig.Parse(json.RawMessage(configParam))
				profileLoaded = true
			} else if store != nil {
				if p, err := store.Get(configParam); err == nil {
					// Profile password check.
					if p.PasswordHash != "" {
						pw := r.Header.Get("X-Profile-Password")
						if pw == "" {
							pw = queryValue(raw, "password", "")
						}
						if err := store.CheckPassword(configParam, pw); err != nil {
							http.Error(w, "profile password required", http.StatusUnauthorized)
							ms.Record(r.URL.Path, http.StatusUnauthorized, latMs(start))
							return
						}
					}
					imgCfg = imageconfig.Parse(p.Config)
					profileLoaded = true
				}
			}
		}

		// Include a fingerprint of configParam when no profile was loaded so
		// different inline configs produce different cache keys without allowing
		// attackers to poison the cache with unbounded unique raw strings.
		cfgKeyInput := imageconfig.CacheKey(imgCfg)
		if !profileLoaded {
			h := sha256.Sum256([]byte(configParam))
			cfgKeyInput = cfgKeyInput + ":" + hex.EncodeToString(h[:8])
		}
		cacheKey := render.CacheKey(mediaType, id, cfgKeyInput, uuid)
		var pngBytes []byte
		fromCache := false
		if renderCache != nil {
			if e, ok := renderCache.Get(cacheKey); ok {
				pngBytes = e.Data
				fromCache = true
			}
		}
		if !fromCache {
			var renderResult *compose.Result
			if pipeline != nil {
				renderResult, _ = pipeline.Render(r.Context(), compose.Request{
					MediaType: mediaType,
					MediaID:   id,
					Config:    imgCfg,
				})
				if renderResult != nil {
					pngBytes = renderResult.ImageBytes
				}
			}
			if len(pngBytes) == 0 {
				pngBytes = render.PlaceholderPNG(mediaType)
			}
			if renderCache != nil {
				ttl := effectiveTTL(renderResult, cfg.ProviderTTLs)
				_ = renderCache.SetWithTTL(cacheKey, pngBytes, ttl)
			}
		}
		if fromCache {
			w.Header().Set("X-Cache", "HIT")
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("X-Cache-Key", cacheKey)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(pngBytes)
		ms.Record("/"+mediaType, http.StatusOK, latMs(start))
	}
	for _, mt := range []string{"poster", "backdrop", "thumbnail", "logo"} {
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
	registerAdminRoutes(mux, ms, cfg, settingsStore, pipeline, renderCache)

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
	registerStremioAddon(mux, cfg)

	// Static file handler — registered last so API routes take precedence.
	if len(staticFS) > 0 && staticFS[0] != nil {
		mux.HandleFunc("/", staticFileHandler(staticFS[0]))
	}

	return mux
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

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
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

