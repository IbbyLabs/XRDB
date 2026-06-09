package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/metrics"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/render"
)

type statusResponse struct {
	Service string `json:"service"`
	Status  string `json:"status"`
	Version string `json:"version"`
}

type renderPlaceholderResponse struct {
	Service string `json:"service"`
	Status  string `json:"status"`
	Type    string `json:"type"`
	ID      string `json:"id"`
	CacheKey string `json:"cacheKey"`
}

func NewHandler(version string, store *profile.Store, pipeline *compose.Pipeline, renderCache *cache.Cache) http.Handler {
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

	mux.HandleFunc("/{type}/{id}", func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			ms.Record(r.URL.Path, http.StatusMethodNotAllowed, latMs(start))
			return
		}
		mediaType := r.PathValue("type")
		id := r.PathValue("id")
		if !render.IsValidMediaType(mediaType) {
			http.Error(w, "invalid media type", http.StatusBadRequest)
			ms.Record(r.URL.Path, http.StatusBadRequest, latMs(start))
			return
		}
		raw := r.URL.RawQuery
		configParam := queryValue(raw, "config", "default")
		uuid := queryValue(raw, "uuid", "none")

		// Resolve profile config if a profile ID is provided.
		// profileLoaded tracks whether we loaded a real profile (affects cache key).
		cfg := imageconfig.Default()
		profileLoaded := false
		if store != nil && configParam != "default" {
			if p, err := store.Get(configParam); err == nil {
				cfg = imageconfig.Parse(p.Config)
				profileLoaded = true
			}
		}

		// Include raw configParam as a tiebreaker when no profile was loaded,
		// so different raw config strings produce different cache keys.
		cfgKeyInput := imageconfig.CacheKey(cfg)
		if !profileLoaded {
			cfgKeyInput = cfgKeyInput + ":" + configParam
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
			if pipeline != nil {
				result, _ := pipeline.Render(r.Context(), compose.Request{
					MediaType: mediaType,
					MediaID:   id,
					Config:    cfg,
				})
				if result != nil {
					pngBytes = result.ImageBytes
				}
			}
			if len(pngBytes) == 0 {
				pngBytes = render.PlaceholderPNG(mediaType)
			}
			if renderCache != nil {
				_ = renderCache.Set(cacheKey, pngBytes)
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
	})

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

	mux.HandleFunc("/profile", func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			http.Error(w, "profile store unavailable", http.StatusServiceUnavailable)
			return
		}
		switch r.Method {
		case http.MethodGet:
			profiles, err := store.List()
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			if profiles == nil {
				profiles = []*profile.Profile{}
			}
			writeJSON(w, http.StatusOK, profiles)
		case http.MethodPost:
			body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
			if err != nil {
				http.Error(w, "read body", http.StatusBadRequest)
				return
			}
			var p profile.Profile
			if err := json.Unmarshal(body, &p); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if err := store.Save(&p); err != nil {
				if errors.Is(err, profile.ErrConflict) {
					http.Error(w, "profile already exists", http.StatusConflict)
					return
				}
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeJSON(w, http.StatusCreated, &p)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/profile/{id}", func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			http.Error(w, "profile store unavailable", http.StatusServiceUnavailable)
			return
		}
		id := r.PathValue("id")
		switch r.Method {
		case http.MethodGet:
			p, err := store.Get(id)
			if err != nil {
				if errors.Is(err, profile.ErrNotFound) {
					http.Error(w, "not found", http.StatusNotFound)
					return
				}
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, p)
		case http.MethodPut:
			body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
			if err != nil {
				http.Error(w, "read body", http.StatusBadRequest)
				return
			}
			var p profile.Profile
			if err := json.Unmarshal(body, &p); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			p.ID = id
			if err := store.Update(&p); err != nil {
				if errors.Is(err, profile.ErrNotFound) {
					http.Error(w, "not found", http.StatusNotFound)
					return
				}
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			updated, err := store.Get(id)
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, updated)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/profile/{id}/export", func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			http.Error(w, "profile store unavailable", http.StatusServiceUnavailable)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := r.PathValue("id")
		p, err := store.Get(id)
		if err != nil {
			if errors.Is(err, profile.ErrNotFound) {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		env := profile.ExportEnvelope{Version: 1, Profiles: []profile.Profile{*p}}
		w.Header().Set("Content-Disposition", `attachment; filename="xrdb-profile-`+id+`.json"`)
		writeJSON(w, http.StatusOK, env)
	})

	mux.HandleFunc("/profile/import", func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			http.Error(w, "profile store unavailable", http.StatusServiceUnavailable)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}
		var env profile.ExportEnvelope
		if err := json.Unmarshal(body, &env); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		type importResult struct {
			Imported int      `json:"imported"`
			Skipped  int      `json:"skipped"`
			Errors   []string `json:"errors,omitempty"`
		}
		var res importResult
		for i := range env.Profiles {
			p := &env.Profiles[i]
			if err := store.Save(p); err != nil {
				if errors.Is(err, profile.ErrConflict) {
					res.Skipped++
					continue
				}
				res.Errors = append(res.Errors, p.ID+": "+err.Error())
				continue
			}
			res.Imported++
		}
		status := http.StatusOK
		if res.Imported == 0 && len(res.Errors) > 0 {
			status = http.StatusUnprocessableEntity
		}
		writeJSON(w, status, res)
	})

	mux.HandleFunc("/api/admin/metrics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, ms.Snapshot())
	})

	mux.HandleFunc("/api/admin/cache", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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

	return mux
}

func latMs(start time.Time) float64 {
	return float64(time.Since(start).Microseconds()) / 1000.0
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
