package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/metrics"
	"xrdb_rewrite/internal/render"
	"xrdb_rewrite/internal/settings"
)

func refreshTMDBCredentials(pipeline *compose.Pipeline, settingsStore *settings.Store) {
	if pipeline == nil || settingsStore == nil {
		return
	}
	tmdb := pipeline.TMDBClient()
	if tmdb == nil {
		return
	}
	apiKey := os.Getenv("XRDB_TMDB_API_KEY")
	readToken := os.Getenv("XRDB_TMDB_READ_TOKEN")
	if v, err := settingsStore.Get("tmdb_api_key"); err == nil && v != "" {
		apiKey = v
	}
	if v, err := settingsStore.Get("tmdb_read_token"); err == nil && v != "" {
		readToken = v
	}
	tmdb.UpdateCredentials(apiKey, readToken)
}

// registerAdminRoutes mounts all /api/admin/* handlers onto mux.
func registerAdminRoutes(
	mux *http.ServeMux,
	ms *metrics.Store,
	cfg config.Config,
	settingsStore *settings.Store,
	pipeline *compose.Pipeline,
	renderCache *cache.Cache,
) {
	mux.HandleFunc("/api/admin/metrics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if cfg.AdminKey != "" && !bearerMatches(r, cfg.AdminKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		writeJSON(w, http.StatusOK, ms.Snapshot())
	})

	mux.HandleFunc("/api/admin/cache", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if cfg.AdminKey != "" && !bearerMatches(r, cfg.AdminKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if renderCache == nil {
			type cacheInfo struct {
				Status string `json:"status"`
			}
			writeJSON(w, http.StatusOK, cacheInfo{Status: "cache not configured"})
			return
		}
		writeJSON(w, http.StatusOK, renderCache.Stats())
	})

	// Log level: GET reports the level in force and where it came from, PUT
	// changes it on the running process. A level saved here is persisted and
	// wins over XRDB_LOG_LEVEL on the next start; DELETE drops back to the
	// environment. Verbosity is deliberately changeable without a restart —
	// restarting to debug a live problem discards the state being debugged.
	mux.HandleFunc("/api/admin/log-level", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			if cfg.AdminKey == "" || !bearerMatches(r, cfg.AdminKey) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		} else if cfg.AdminKey != "" && !bearerMatches(r, cfg.AdminKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// source describes which layer supplied the level in force, so an
		// operator can tell why a value they set elsewhere is not winning.
		source := func() string {
			if settingsStore != nil {
				if v, err := settingsStore.Get(settings.LogLevelKey); err == nil && v != "" {
					return "stored"
				}
			}
			if os.Getenv("XRDB_LOG_LEVEL") != "" {
				return "environment"
			}
			return "default"
		}
		type levelState struct {
			Level     string   `json:"level"`
			Source    string   `json:"source"`
			Levels    []string `json:"levels"`
			Env       string   `json:"env"`
			Persisted bool     `json:"persisted"`
		}
		respond := func() {
			writeJSON(w, http.StatusOK, levelState{
				Level:     logging.LevelName(),
				Source:    source(),
				Levels:    logging.Levels,
				Env:       os.Getenv("XRDB_LOG_LEVEL"),
				Persisted: settingsStore != nil,
			})
		}

		switch r.Method {
		case http.MethodGet:
			respond()
		case http.MethodPut:
			var body struct {
				Level string `json:"level"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			previous := logging.LevelName()
			if !logging.SetLevel(body.Level) {
				http.Error(w, "unsupported level", http.StatusBadRequest)
				return
			}
			// Persist so the choice survives a restart. A store failure must not
			// undo the live change: the operator asked for this verbosity now.
			if settingsStore != nil {
				if err := settingsStore.Set(settings.LogLevelKey, logging.LevelName()); err != nil {
					slog.WarnContext(r.Context(), "Changed the log level but could not persist it; it will revert on restart",
						"error", err, "level", logging.LevelName())
				}
			}
			slog.InfoContext(r.Context(), "Changed the log level",
				"previous", previous, "level", logging.LevelName())
			respond()
		case http.MethodDelete:
			if settingsStore == nil {
				http.Error(w, "settings store unavailable", http.StatusServiceUnavailable)
				return
			}
			if err := settingsStore.Delete(settings.LogLevelKey); err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			// Fall back to the environment, or the built-in default when unset.
			// Not cfg.LogLevel: startup folds a stored level into it, so it can
			// hold the very value being cleared.
			fallback := os.Getenv("XRDB_LOG_LEVEL")
			if fallback == "" {
				fallback = config.DefaultLogLevel
			}
			previous := logging.LevelName()
			logging.SetLevel(fallback)
			slog.InfoContext(r.Context(), "Cleared the stored log level",
				"previous", previous, "level", logging.LevelName())
			respond()
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Settings: GET returns all keys (values masked), PUT upserts a single key,
	// DELETE removes a key by ?key= query param.
	mux.HandleFunc("/api/admin/settings", func(w http.ResponseWriter, r *http.Request) {
		// Write operations require AdminKey to be configured and match.
		// GET remains accessible when no key is set (read-only, values masked).
		if r.Method != http.MethodGet {
			if cfg.AdminKey == "" || !bearerMatches(r, cfg.AdminKey) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		} else if cfg.AdminKey != "" && !bearerMatches(r, cfg.AdminKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if settingsStore == nil {
			http.Error(w, "settings store unavailable", http.StatusServiceUnavailable)
			return
		}
		switch r.Method {
		case http.MethodGet:
			all, err := settingsStore.All()
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			// Mask values: return whether each key is set, not the actual value.
			type keyStatus struct {
				Key string `json:"key"`
				Set bool   `json:"set"`
			}
			out := make([]keyStatus, 0, len(all))
			for k, v := range all {
				out = append(out, keyStatus{Key: k, Set: v != ""})
			}
			writeJSON(w, http.StatusOK, out)
		case http.MethodPut:
			var body struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if body.Key == "" {
				http.Error(w, "key required", http.StatusBadRequest)
				return
			}
			if err := settingsStore.Set(body.Key, body.Value); err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			refreshTMDBCredentials(pipeline, settingsStore)
			w.WriteHeader(http.StatusNoContent)
		case http.MethodDelete:
			key := r.URL.Query().Get("key")
			if key == "" {
				http.Error(w, "key required", http.StatusBadRequest)
				return
			}
			if err := settingsStore.Delete(key); err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			refreshTMDBCredentials(pipeline, settingsStore)
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Poster warming: pre-renders a list of IDs into the cache in the background.
	// POST /api/admin/warm  { "ids": ["tt123","tt456"], "mediaType": "poster", "config": "..." }
	mux.HandleFunc("/api/admin/warm", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if cfg.AdminKey == "" || !bearerMatches(r, cfg.AdminKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if pipeline == nil || renderCache == nil {
			http.Error(w, "pipeline or cache not configured", http.StatusServiceUnavailable)
			return
		}

		var body struct {
			IDs       []string `json:"ids"`
			MediaType string   `json:"mediaType"`
			Config    string   `json:"config"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if len(body.IDs) == 0 {
			http.Error(w, "ids required", http.StatusBadRequest)
			return
		}
		if len(body.IDs) > 500 {
			http.Error(w, "too many ids (max 500)", http.StatusBadRequest)
			return
		}
		mediaType := body.MediaType
		if mediaType == "" {
			mediaType = "poster"
		}
		// ParseSurface resolves config per surface, so an unknown mediaType would
		// silently warm Default() instead of the requested surface. Reject it.
		if !imageconfig.IsSurface(mediaType) {
			http.Error(w, "unsupported mediaType", http.StatusBadRequest)
			return
		}

		imgCfg := imageconfig.Default()
		if body.Config != "" {
			// Unlike the public render path (which degrades gracefully), this is
			// an operator tool — surface a malformed config instead of silently
			// warming Default().
			if !json.Valid([]byte(body.Config)) {
				http.Error(w, "invalid config JSON", http.StatusBadRequest)
				return
			}
			imgCfg = imageconfig.ParseSurface(json.RawMessage(body.Config), mediaType)
		}

		// Kick off warming in the background; respond immediately.
		ids := make([]string, len(body.IDs))
		copy(ids, body.IDs)
		go warmPosters(pipeline, renderCache, ids, mediaType, imgCfg, cfg.ProviderTTLs)

		type warmResponse struct {
			Accepted  int    `json:"accepted"`
			MediaType string `json:"mediaType"`
		}
		writeJSON(w, http.StatusAccepted, warmResponse{Accepted: len(ids), MediaType: mediaType})
	})
}

// warmPosters renders each id into the cache. Runs in a goroutine.
// Concurrency is limited to 4 to avoid hammering upstream APIs.
func warmPosters(
	pipeline *compose.Pipeline,
	renderCache *cache.Cache,
	ids []string,
	mediaType string,
	imgCfg imageconfig.Config,
	ttls map[string]time.Duration,
) {
	const concurrency = 4
	sem := make(chan struct{}, concurrency)
	for _, id := range ids {
		sem <- struct{}{}
		go func(id string) {
			defer func() { <-sem }()
			req := compose.Request{MediaType: mediaType, MediaID: id, Config: imgCfg}
			cacheKey := render.CacheKey(mediaType, id, imageconfig.CacheKey(imgCfg), "")
			if _, ok := renderCache.Get(cacheKey); ok {
				return // already cached
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			result, err := pipeline.Render(ctx, req)
			if err != nil || result == nil || len(result.ImageBytes) == 0 {
				slog.Warn("Skipped warming an item", "media_type", mediaType, "media_id", id, "error", err)
				return
			}
			ttl := effectiveTTL(result, ttls)
			if err := renderCache.SetWithTTL(cacheKey, result.ImageBytes, ttl); err != nil {
				slog.Warn("Failed to cache a warmed render", "media_type", mediaType, "media_id", id, "error", err)
			}
		}(id)
	}
	// Drain the semaphore — wait for all goroutines to finish.
	for range concurrency {
		sem <- struct{}{}
	}
}

// effectiveTTL returns the minimum TTL across all providers that contributed to
// a render result. Falls back to 0 (cache default) when result or ttls is nil.
func effectiveTTL(result *compose.Result, ttls map[string]time.Duration) time.Duration {
	if result == nil || len(ttls) == 0 || len(result.ContributingProviders) == 0 {
		return 0
	}
	var min time.Duration
	for _, name := range result.ContributingProviders {
		if t, ok := ttls[name]; ok && t > 0 {
			if min == 0 || t < min {
				min = t
			}
		}
	}
	return min
}
