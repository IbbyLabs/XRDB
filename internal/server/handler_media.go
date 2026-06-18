package server

import (
	"net/http"
	"strconv"
	"strings"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/provider"
)

func tmdbUnavailable(t *provider.TMDB) bool {
	return t == nil || !t.HasCredentials()
}

// registerMediaRoutes mounts title search/trending/lookup endpoints used by
// the configurator's preview tools. All are TMDB-backed and read-only.
func registerMediaRoutes(mux *http.ServeMux, pipeline *compose.Pipeline) {
	tmdbFor := func() *provider.TMDB {
		if pipeline == nil {
			return nil
		}
		return pipeline.TMDBClient()
	}

	mux.HandleFunc("/api/search", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		t := tmdbFor()
		if tmdbUnavailable(t) {
			http.Error(w, "search requires a TMDB key", http.StatusServiceUnavailable)
			return
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			writeJSON(w, http.StatusOK, []provider.TitleResult{})
			return
		}
		results, err := t.SearchTitles(r.Context(), q)
		if err != nil {
			http.Error(w, "search failed", http.StatusBadGateway)
			return
		}
		if results == nil {
			results = []provider.TitleResult{}
		}
		writeJSON(w, http.StatusOK, results)
	})

	mux.HandleFunc("/api/trending", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		t := tmdbFor()
		if tmdbUnavailable(t) {
			http.Error(w, "trending requires a TMDB key", http.StatusServiceUnavailable)
			return
		}
		results, err := t.TrendingTitles(r.Context())
		if err != nil {
			http.Error(w, "trending failed", http.StatusBadGateway)
			return
		}
		if results == nil {
			results = []provider.TitleResult{}
		}
		writeJSON(w, http.StatusOK, results)
	})

	mux.HandleFunc("/api/lookup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		t := tmdbFor()
		if tmdbUnavailable(t) {
			http.Error(w, "lookup requires a TMDB key", http.StatusServiceUnavailable)
			return
		}
		mediaType := r.URL.Query().Get("type")
		if mediaType != "movie" && mediaType != "tv" {
			http.Error(w, "type must be movie or tv", http.StatusBadRequest)
			return
		}
		id, err := strconv.Atoi(r.URL.Query().Get("id"))
		if err != nil || id <= 0 {
			http.Error(w, "id must be a TMDB numeric id", http.StatusBadRequest)
			return
		}
		imdbID, err := t.LookupIMDbID(r.Context(), mediaType, id)
		if err != nil {
			http.Error(w, "lookup failed", http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"imdbId": imdbID})
	})
}
