package server

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/provider"
)

// upcomingTTL is how long a region's upcoming list is held. A release date
// moves on the scale of days.
const upcomingTTL = 6 * time.Hour

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

	// upcoming is cached per region: the list changes on the scale of a release
	// date, and the preview asks for it on every configurator load.
	type upcomingEntry struct {
		results []provider.TitleResult
		at      time.Time
	}
	var upcomingMu sync.Mutex
	upcoming := map[string]upcomingEntry{}

	mux.HandleFunc("/api/upcoming", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		t := tmdbFor()
		if tmdbUnavailable(t) {
			http.Error(w, "upcoming requires a TMDB key", http.StatusServiceUnavailable)
			return
		}
		region := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("region")))
		if len(region) > 2 {
			region = region[:2]
		}

		upcomingMu.Lock()
		held, ok := upcoming[region]
		upcomingMu.Unlock()
		if ok && time.Since(held.at) < upcomingTTL {
			writeJSON(w, http.StatusOK, held.results)
			return
		}

		results, err := t.UpcomingTitles(r.Context(), region)
		if err != nil {
			// The preview falls back to its fixed title without saying so, so
			// this line is the only place the failure is visible.
			slog.Default().WarnContext(r.Context(), "The upcoming list did not answer; the preview keeps its fixed title",
				"region", region, "error", err)
			http.Error(w, "upcoming failed", http.StatusBadGateway)
			return
		}
		if len(results) == 0 {
			slog.Default().WarnContext(r.Context(), "The upcoming list was empty; the preview keeps its fixed title",
				"region", region)
		}
		if results == nil {
			results = []provider.TitleResult{}
		}
		upcomingMu.Lock()
		upcoming[region] = upcomingEntry{results: results, at: time.Now()}
		upcomingMu.Unlock()
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
