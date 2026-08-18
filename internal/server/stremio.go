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
//   GET /stremio/c/{config}/manifest.json
//   GET /stremio/c/{config}/meta/{type}/{id}.json
//
// CORS is enabled on all /stremio/* routes (required by Stremio).

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/profile"
)

// cinemetaClient fetches upstream meta for the rating-strip path. Bounded so a
// slow Cinemeta cannot hang a meta request.
var cinemetaClient = &http.Client{Timeout: 6 * time.Second}

// stremioCinemetaBase is empty in production, meaning the default upstream.
// Tests point it at a stub so the meta path can be exercised without network.
var stremioCinemetaBase = ""

// stremioManifest is the Stremio addon manifest shape (subset used by XRDB).
type stremioManifest struct {
	ID            string       `json:"id"`
	Version       string       `json:"version"`
	Name          string       `json:"name"`
	Description   string       `json:"description"`
	Logo          string       `json:"logo,omitempty"`
	Resources     []string     `json:"resources"`
	Types         []string     `json:"types"`
	IDPrefixes    []string     `json:"idPrefixes"`
	Catalogs      []any        `json:"catalogs"`
	BehaviorHints stremioHints `json:"behaviorHints"`
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

// manifestVersion renders a build string as the semver Stremio requires. It
// rejects anything else outright, so a leading "v" or a dated dev build makes
// the addon refuse to install rather than degrade.
func manifestVersion(v string) string {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(strings.TrimPrefix(v, "v"), "V")
	if semverRelease.MatchString(v) {
		return v
	}
	// No release number to show, so the build goes in a prerelease tag, which
	// keeps it visible and still parses.
	build := nonSemver.ReplaceAllString(v, ".")
	build = strings.Trim(build, ".")
	if build == "" {
		return "0.0.0"
	}
	return "0.0.0-" + build
}

var (
	semverRelease = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$`)
	nonSemver     = regexp.MustCompile(`[^0-9A-Za-z-]+`)
)

// stremioManifestFor builds the addon manifest.
func stremioManifestFor(cfg config.Config) stremioManifest {
	return stremioManifest{
		ID:      "com.ibbylabs.xrdb",
		Version: manifestVersion(cfg.Version),
		Name:    "XRDB",
		// Stremio shows this in its addon list, which is where someone decides.
		// Naming the scope here reaches them before the install rather than after.
		Description: "Ratings and quality badges overlaid on movie and series artwork. Supplies metadata for a title you open and no catalogue rows of its own, so browse rows and your library keep the artwork their own source supplies.",
		Resources:   []string{"meta"},
		Types:       []string{"movie", "series"},
		IDPrefixes:  []string{"tt"},
		Catalogs:    []any{},
		// Advertising this is what makes Stremio show a Configure button on the
		// addon, which opens /configure on this host.
		BehaviorHints: stremioHints{Configurable: true},
	}
}

// registerStremioAddon registers /stremio/* routes on mux.
//
// Two bases are served:
//
//	/stremio/...            the instance default look
//	/stremio/c/{config}/... a saved profile, by id or alias
//
// Stremio derives every resource URL from the directory it installed the
// manifest from, so carrying the profile in the path is what lets one instance
// serve a different look per user. Without it the addon would advertise itself
// as configurable and then ignore whatever the user configured.
func registerStremioAddon(mux *http.ServeMux, cfg config.Config, store *profile.Store, trust proxyTrust) {
	manifestHandler := stremioMiddleware(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, stremioManifestFor(cfg))
	})
	mux.HandleFunc("/stremio/manifest.json", manifestHandler)
	mux.HandleFunc("/stremio/c/{config}/manifest.json", manifestHandler)

	// Stremio opens <addon-host>/configure for a configurable addon. The
	// configurator lives at /configurator, so meet Stremio's convention here
	// rather than moving the page and breaking existing links.
	mux.HandleFunc("/configure", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		http.Redirect(w, r, "/configurator", http.StatusFound)
	})

	mux.HandleFunc("/stremio/c/{config}/meta/", stremioMiddleware(func(w http.ResponseWriter, r *http.Request) {
		configKey := r.PathValue("config")
		prefix := "/stremio/c/" + configKey + "/meta/"
		serveStremioMeta(w, r, cfg, store, trust, configKey, strings.TrimPrefix(r.URL.Path, prefix))
	}))

	mux.HandleFunc("/stremio/meta/", stremioMiddleware(func(w http.ResponseWriter, r *http.Request) {
		serveStremioMeta(w, r, cfg, store, trust, "", strings.TrimPrefix(r.URL.Path, "/stremio/meta/"))
	}))
}

// serveStremioMeta answers a meta request for {type}/{id}.json, emitting artwork
// URLs that point back at this instance's render routes. configKey is the
// profile the install is bound to, or "" for the instance default.
func serveStremioMeta(w http.ResponseWriter, r *http.Request, cfg config.Config, store *profile.Store, trust proxyTrust, configKey, path string) {
	trimmed := strings.TrimSuffix(path, ".json")
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

	// Both movie and series use poster as the XRDB render type.
	xrdbType := "poster"

	// Build base URL for XRDB renders from the incoming request. The forwarded
	// hints are only believed when the peer is a trusted proxy.
	base := fmt.Sprintf("%s://%s", forwardedScheme(r, trust), forwardedHost(r, trust))

	// Carry the content type (movie|series) so the render pipeline can pass
	// it to the rating providers. Without it, providers fall back to guessing
	// movie-vs-series from the artwork surface — the bug that made series
	// posters resolve as movies and drop most of their ratings.
	q := url.Values{"type": {mediaType}}
	if configKey != "" {
		q.Set("config", configKey)
		// Stremio re-fetches meta far more often than it re-fetches an image it
		// already has, so this is the right place to hand it a fresh URL after
		// a profile edit.
		if store != nil {
			if p, err := store.Resolve(configKey); err == nil && p.VersionToken != "" {
				q.Set("v", p.VersionToken)
			}
		}
	}
	// If an API key is required, embed it as a query parameter.
	// Note: exposing the key in URLs is a trade-off for Stremio compatibility.
	if cfg.APIKey != "" {
		q.Set("key", cfg.APIKey)
	}
	posterURL := fmt.Sprintf("%s/%s/%s?%s", base, xrdbType, id, q.Encode())
	backdropURL := fmt.Sprintf("%s/backdrop/%s?%s", base, id, q.Encode())

	// Stremio queries every addon that serves the resource and renders the first
	// one that is ready, without merging, so a response carrying only artwork
	// gives a details page with no title and no episodes when it wins. Serving
	// the upstream meta with XRDB artwork overlaid makes winning harmless.
	// A fetch failure falls back to the minimal meta below rather than dropping
	// the title.
	if meta, err := fetchCinemetaMeta(r.Context(), cinemetaClient, stremioCinemetaBase, mediaType, id); err == nil {
		if hideCinemetaRating(store, configKey) {
			meta = stripImdbRating(meta)
		}
		meta["poster"] = posterURL
		meta["background"] = backdropURL
		writeJSON(w, http.StatusOK, map[string]any{"meta": meta})
		return
	}

	writeJSON(w, http.StatusOK, stremioMetaResponse{
		Meta: stremioMeta{
			ID:         id,
			Type:       mediaType,
			Poster:     posterURL,
			Background: backdropURL,
		},
	})
}

// hideCinemetaRating reports whether the named profile asked for the Cinemeta
// IMDb rating to be stripped from its Stremio meta.
func hideCinemetaRating(store *profile.Store, configKey string) bool {
	if store == nil || configKey == "" {
		return false
	}
	p, err := store.Resolve(configKey)
	if err != nil {
		return false
	}
	return imageconfig.ParseSurface(p.Config, "poster").HideCinemetaRating
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
