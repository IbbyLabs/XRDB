package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"runtime/debug"
	"strconv"
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

// refreshProviderCredentials pushes the effective credential for every keyed
// provider into its live client, so a key saved or cleared through the settings
// API takes effect without a restart. Effective value is the stored key, or the
// environment variable when none is stored — the same precedence as startup.
func refreshProviderCredentials(pipeline *compose.Pipeline, settingsStore *settings.Store) {
	if pipeline == nil || settingsStore == nil {
		return
	}
	effective := func(settingsKey, envVar string) string {
		if v, err := settingsStore.Get(settingsKey); err == nil && v != "" {
			return v
		}
		return os.Getenv(envVar)
	}

	// TMDB takes two credentials, so it does not fit the single-key shape below.
	if tmdb := pipeline.TMDBClient(); tmdb != nil {
		tmdb.UpdateCredentials(
			effective("tmdb_api_key", "XRDB_TMDB_API_KEY"),
			effective("tmdb_read_token", "XRDB_TMDB_READ_TOKEN"),
		)
	}

	// The remaining providers each take a single key or client id.
	type singleKeyed interface{ UpdateCredentials(string) }
	for _, m := range []struct{ provider, settingsKey, envVar string }{
		{"mdblist", "mdblist_api_key", "XRDB_MDBLIST_API_KEY"},
		{"omdb", "omdb_api_key", "XRDB_OMDB_API_KEY"},
		{"fanart", "fanart_api_key", "XRDB_FANART_API_KEY"},
		{"trakt", "trakt_client_id", "XRDB_TRAKT_CLIENT_ID"},
		{"simkl", "simkl_client_id", "XRDB_SIMKL_CLIENT_ID"},
	} {
		if kp, ok := pipeline.Provider(m.provider).(singleKeyed); ok {
			kp.UpdateCredentials(effective(m.settingsKey, m.envVar))
		}
	}
}

// applyMemoryLimit sets the runtime soft heap limit. A value of zero or less
// means "no limit" (the runtime spelling of that is math.MaxInt64).
func applyMemoryLimit(limitMB int64) {
	if limitMB <= 0 {
		debug.SetMemoryLimit(math.MaxInt64)
		return
	}
	debug.SetMemoryLimit(limitMB << 20)
}

// memoryLimitMBFromEnv reads XRDB_MEMORY_LIMIT_MB, returning 0 (no limit) when
// unset or unparseable.
func memoryLimitMBFromEnv() int64 {
	raw := os.Getenv("XRDB_MEMORY_LIMIT_MB")
	if raw == "" {
		return 0
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n < 0 {
		return 0
	}
	return n
}

// registerAdminRoutes mounts all /api/admin/* handlers onto mux.
func registerAdminRoutes(
	mux *http.ServeMux,
	ms *metrics.Store,
	cfg config.Config,
	settingsStore *settings.Store,
	pipeline *compose.Pipeline,
	renderCache *cache.Cache,
	ttls *ttlStore,
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

	// Memory limit: GET reports the soft heap limit in force and where it came
	// from, PUT changes it on the running process (debug.SetMemoryLimit is safe
	// to call at any time), DELETE reverts to the environment. A value set here
	// persists and wins over XRDB_MEMORY_LIMIT_MB on the next start. Raising the
	// limit live lets an operator give a loaded instance headroom without the
	// restart that would drop its warm cache.
	mux.HandleFunc("/api/admin/memory-limit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			if cfg.AdminKey == "" || !bearerMatches(r, cfg.AdminKey) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		} else if cfg.AdminKey != "" && !bearerMatches(r, cfg.AdminKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		source := func() string {
			if settingsStore != nil {
				if v, err := settingsStore.Get(settings.MemoryLimitKey); err == nil && v != "" {
					return "stored"
				}
			}
			if os.Getenv("XRDB_MEMORY_LIMIT_MB") != "" {
				return "environment"
			}
			return "default"
		}
		// currentLimitMB reports the live soft limit in MiB, or 0 when unset
		// (the runtime uses math.MaxInt64 to mean "no limit").
		currentLimitMB := func() int64 {
			cur := debug.SetMemoryLimit(-1)
			if cur == math.MaxInt64 {
				return 0
			}
			return cur >> 20
		}
		type limitState struct {
			LimitMB   int64  `json:"limitMb"`
			Source    string `json:"source"`
			Env       string `json:"env"`
			Persisted bool   `json:"persisted"`
		}
		respond := func() {
			writeJSON(w, http.StatusOK, limitState{
				LimitMB:   currentLimitMB(),
				Source:    source(),
				Env:       os.Getenv("XRDB_MEMORY_LIMIT_MB"),
				Persisted: settingsStore != nil,
			})
		}

		switch r.Method {
		case http.MethodGet:
			respond()
		case http.MethodPut:
			var body struct {
				LimitMB int64 `json:"limitMb"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			// Negative is nonsense; an over-large value would overflow the byte
			// conversion. Zero is allowed and means "no soft limit".
			if body.LimitMB < 0 || body.LimitMB > math.MaxInt64>>20 {
				http.Error(w, "limitMb out of range", http.StatusBadRequest)
				return
			}
			previous := currentLimitMB()
			applyMemoryLimit(body.LimitMB)
			if settingsStore != nil {
				if err := settingsStore.Set(settings.MemoryLimitKey, strconv.FormatInt(body.LimitMB, 10)); err != nil {
					slog.WarnContext(r.Context(), "Changed the memory limit but could not persist it; it will revert on restart",
						"error", err, "limit_mb", body.LimitMB)
				}
			}
			slog.InfoContext(r.Context(), "Changed the memory limit",
				"previous_mb", previous, "limit_mb", body.LimitMB)
			respond()
		case http.MethodDelete:
			if settingsStore == nil {
				http.Error(w, "settings store unavailable", http.StatusServiceUnavailable)
				return
			}
			if err := settingsStore.Delete(settings.MemoryLimitKey); err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			// Revert to the environment value, or no limit when it is unset. Not
			// cfg.MemoryLimitBytes: startup folds a stored value into it.
			previous := currentLimitMB()
			applyMemoryLimit(memoryLimitMBFromEnv())
			slog.InfoContext(r.Context(), "Cleared the stored memory limit",
				"previous_mb", previous, "limit_mb", currentLimitMB())
			respond()
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Provider cache TTLs: GET lists each provider's TTL in hours and its source,
	// PUT overrides one provider's TTL live, DELETE reverts one to the
	// environment default. A render caches for the shortest contributing
	// provider's TTL, so lowering one makes that source refresh sooner without a
	// restart. Stored values win over env defaults on the next start.
	mux.HandleFunc("/api/admin/ttls", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			if cfg.AdminKey == "" || !bearerMatches(r, cfg.AdminKey) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		} else if cfg.AdminKey != "" && !bearerMatches(r, cfg.AdminKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if ttls == nil {
			http.Error(w, "ttl store unavailable", http.StatusServiceUnavailable)
			return
		}
		sourceOf := func(provider string) string {
			if settingsStore != nil {
				if v, err := settingsStore.Get(settings.TTLKey(provider)); err == nil && v != "" {
					return "stored"
				}
			}
			if os.Getenv(config.ProviderTTLEnvVar(provider)) != "" {
				return "environment"
			}
			return "default"
		}
		type ttlEntry struct {
			Provider string  `json:"provider"`
			Hours    float64 `json:"hours"`
			Source   string  `json:"source"`
		}
		respond := func() {
			names := ttls.providers()
			out := make([]ttlEntry, 0, len(names))
			for _, name := range names {
				d, _ := ttls.get(name)
				out = append(out, ttlEntry{
					Provider: name,
					Hours:    d.Hours(),
					Source:   sourceOf(name),
				})
			}
			writeJSON(w, http.StatusOK, out)
		}

		switch r.Method {
		case http.MethodGet:
			respond()
		case http.MethodPut:
			var body struct {
				Provider string  `json:"provider"`
				Hours    float64 `json:"hours"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if _, known := ttls.get(body.Provider); !known {
				http.Error(w, "unknown provider", http.StatusBadRequest)
				return
			}
			// Guard against a NaN/Inf or absurd value overflowing the duration.
			if body.Hours < 0 || body.Hours != body.Hours || body.Hours > 24*365 {
				http.Error(w, "hours out of range", http.StatusBadRequest)
				return
			}
			ttls.set(body.Provider, time.Duration(body.Hours*float64(time.Hour)))
			if settingsStore != nil {
				if err := settingsStore.Set(settings.TTLKey(body.Provider), strconv.FormatFloat(body.Hours, 'g', -1, 64)); err != nil {
					slog.WarnContext(r.Context(), "Changed a provider TTL but could not persist it; it will revert on restart",
						"error", err, "provider", body.Provider, "hours", body.Hours)
				}
			}
			slog.InfoContext(r.Context(), "Changed a provider cache TTL",
				"provider", body.Provider, "hours", body.Hours)
			respond()
		case http.MethodDelete:
			provider := r.URL.Query().Get("provider")
			if _, known := ttls.get(provider); !known {
				http.Error(w, "unknown provider", http.StatusBadRequest)
				return
			}
			if settingsStore == nil {
				http.Error(w, "settings store unavailable", http.StatusServiceUnavailable)
				return
			}
			if err := settingsStore.Delete(settings.TTLKey(provider)); err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			// Revert the live value to the environment default, past the stored
			// value we just removed.
			ttls.set(provider, config.ProviderEnvTTL(provider, cfg.CacheTTL))
			slog.InfoContext(r.Context(), "Cleared a stored provider TTL",
				"provider", provider)
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
			refreshProviderCredentials(pipeline, settingsStore)
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
			refreshProviderCredentials(pipeline, settingsStore)
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
		go warmPosters(pipeline, renderCache, ids, mediaType, imgCfg, ttls)

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
	ttls *ttlStore,
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
// a render result. Falls back to 0 (cache default) when result or the store is
// nil. Reading from the live store means a TTL changed at runtime applies to the
// next render without a restart.
func effectiveTTL(result *compose.Result, ttls *ttlStore) time.Duration {
	if result == nil || ttls == nil || len(result.ContributingProviders) == 0 {
		return 0
	}
	var min time.Duration
	for _, name := range result.ContributingProviders {
		if t, ok := ttls.get(name); ok && t > 0 {
			if min == 0 || t < min {
				min = t
			}
		}
	}
	return min
}
