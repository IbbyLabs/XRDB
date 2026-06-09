package server

// Stremio addon compatibility layer.
//
// XRDB exposes a minimal Stremio resource addon that redirects poster/backdrop
// artwork requests to XRDB's own render pipeline. No catalog, no streams.
//
// Stremio users install the addon by pointing their Stremio app at:
//   https://<host>/stremio/manifest.json
//
// The manifest advertises a "meta" resource for movie and series types.
// When Stremio requests meta for a known IMDb ID, XRDB returns a meta object
// with a `poster` and `background` URL that both point back at XRDB render
// endpoints. Stremio will load those URLs as the artwork.
//
// Endpoint summary:
//   GET /stremio/manifest.json
//   GET /stremio/meta/{type}/{id}.json
//
// CORS is enabled on all /stremio/* routes (required by Stremio).

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"xrdb_rewrite/internal/config"
)

// stremioManifest is the Stremio addon manifest shape (subset used by XRDB).
type stremioManifest struct {
	ID          string              `json:"id"`
	Version     string              `json:"version"`
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Logo        string              `json:"logo,omitempty"`
	Resources   []string            `json:"resources"`
	Types       []string            `json:"types"`
	IDPrefixes  []string            `json:"idPrefixes"`
	Catalogs    []any               `json:"catalogs"`
	BehaviorHints stremioHints      `json:"behaviorHints"`
}

type stremioHints struct {
	Configurable bool `json:"configurable,omitempty"`
}

type stremioMetaResponse struct {
	Meta stremioMeta `json:"meta"`
}

type stremioMeta struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Name       string `json:"name,omitempty"`
	Poster     string `json:"poster,omitempty"`
	Background string `json:"background,omitempty"`
}

// registerStremioAddon registers /stremio/* routes on mux.
func registerStremioAddon(mux *http.ServeMux, cfg config.Config) {
	mux.HandleFunc("/stremio/manifest.json", stremioMiddleware(func(w http.ResponseWriter, r *http.Request) {
		manifest := stremioManifest{
			ID:          "com.ibbylabs.xrdb",
			Version:     cfg.Version,
			Name:        "XRDB",
			Description: "Enhanced movie and series artwork powered by XRDB — overlaid ratings, quality badges, and more.",
			Resources:   []string{"meta"},
			Types:       []string{"movie", "series"},
			IDPrefixes:  []string{"tt"},
			Catalogs:    []any{},
			BehaviorHints: stremioHints{},
		}
		writeJSON(w, http.StatusOK, manifest)
	}))

	mux.HandleFunc("/stremio/meta/", stremioMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Path: /stremio/meta/{type}/{id}.json
		trimmed := strings.TrimPrefix(r.URL.Path, "/stremio/meta/")
		trimmed = strings.TrimSuffix(trimmed, ".json")
		parts := strings.SplitN(trimmed, "/", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			http.Error(w, "invalid path", http.StatusBadRequest)
			return
		}
		mediaType, id := parts[0], parts[1]

		// Only movie and series are supported.
		if mediaType != "movie" && mediaType != "series" {
			http.NotFound(w, r)
			return
		}

		// Determine XRDB mediaType from Stremio type.
		xrdbType := "poster"
		if mediaType == "series" {
			xrdbType = "poster"
		}

		// Build base URL for XRDB renders. Derive from the incoming request.
		scheme := "https"
		if r.TLS == nil && (r.Header.Get("X-Forwarded-Proto") == "" || r.Header.Get("X-Forwarded-Proto") == "http") {
			scheme = "http"
		}
		host := r.Host
		if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
			host = fwd
		}
		base := fmt.Sprintf("%s://%s", scheme, host)

		posterURL := fmt.Sprintf("%s/%s/%s", base, xrdbType, id)
		backdropURL := fmt.Sprintf("%s/backdrop/%s", base, id)

		// If an API key is required, embed it as a query parameter.
		// Note: exposing the key in URLs is a trade-off for Stremio compatibility.
		if cfg.APIKey != "" {
			posterURL += "?key=" + url.QueryEscape(cfg.APIKey)
			backdropURL += "?key=" + url.QueryEscape(cfg.APIKey)
		}

		resp := stremioMetaResponse{
			Meta: stremioMeta{
				ID:         id,
				Type:       mediaType,
				Poster:     posterURL,
				Background: backdropURL,
			},
		}
		writeJSON(w, http.StatusOK, resp)
	}))
}

// stremioMiddleware wraps a handler with CORS headers required by Stremio.
func stremioMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}
