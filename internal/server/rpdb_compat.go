package server

import (
	"net/http"
	"net/url"
	"strings"

	"xrdb_rewrite/internal/profile"
)

// RPDB-compatible URL shim.
//
// RPDB serves artwork at:
//
//	/{apiKey}/imdb/poster-default/tt0468569.jpg
//	/{apiKey}/tmdb/poster-default/movie-155.jpg
//	/{apiKey}/imdb/backdrop-default/tt0468569.jpg
//
// Accepting that shape means moving from RPDB is a hostname swap, with the
// profile alias going where the API key was, rather than editing every URL in
// a media app's configuration.
//
// The second path segment is always a literal "imdb" or "tmdb", which is what
// keeps these patterns from swallowing the app's own routes.

// rpdbKind maps RPDB's resource name onto an XRDB surface. The part after the
// dash is RPDB's own poster style, which has no XRDB equivalent: the look comes
// from the profile, so the style is accepted and ignored rather than rejected.
func rpdbKind(resource string) (string, bool) {
	name, _, _ := strings.Cut(resource, "-")
	switch name {
	case "poster":
		return "poster", true
	case "backdrop", "background":
		return "backdrop", true
	case "logo":
		return "logo", true
	}
	return "", false
}

// rpdbMediaID converts the id segment into the form the render route takes, and
// reports the content type when the URL names one.
//
// IMDb ids arrive bare ("tt0468569"). TMDB ids arrive prefixed with their kind
// ("movie-155", "series-1396"), which is worth keeping: it saves the rating
// providers from guessing movie-vs-series, which is the guess that used to drop
// most of a series' ratings.
func rpdbMediaID(source, raw string) (id string, contentType string, ok bool) {
	raw = strings.TrimSuffix(raw, ".jpg")
	raw = strings.TrimSuffix(raw, ".png")
	if raw == "" {
		return "", "", false
	}
	switch source {
	case "imdb":
		return raw, "", true
	case "tmdb":
		kind, rest, found := strings.Cut(raw, "-")
		if !found {
			return raw, "", true
		}
		switch kind {
		case "movie":
			return rest, "movie", true
		case "series", "show", "tv":
			return rest, "series", true
		}
		return raw, "", true
	}
	return "", "", false
}

// registerRPDBCompat mounts the RPDB-shaped routes. A matching request is
// rewritten into the app's own render URL and served through the same mux, so
// there is one render path rather than two that can drift apart.
func registerRPDBCompat(mux *http.ServeMux) {

	// source is a literal in each pattern rather than a wildcard, so it is
	// passed in rather than read back off the request.
	handlerFor := func(source string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			mediaType, ok := rpdbKind(r.PathValue("resource"))
			if !ok {
				http.NotFound(w, r)
				return
			}
			id, contentType, ok := rpdbMediaID(source, r.PathValue("id"))
			if !ok {
				http.NotFound(w, r)
				return
			}

			q := url.Values{}
			// RPDB's key slot carries the XRDB profile alias or id. "default" is
			// spelled the same in both, so it needs no special case.
			if key := r.PathValue("key"); key != "" {
				q.Set("config", key)
			}
			if contentType != "" {
				q.Set("type", contentType)
			}
			// Carry through the parameters the render route understands; anything
			// RPDB-specific (fallback, lang) is left behind deliberately.
			for _, name := range []string{"key", "cb", "v"} {
				if v := r.URL.Query().Get(name); v != "" {
					q.Set(name, v)
				}
			}

			rewritten := r.Clone(r.Context())
			rewritten.URL = &url.URL{Path: "/" + mediaType + "/" + id, RawQuery: q.Encode()}
			rewritten.RequestURI = ""
			mux.ServeHTTP(w, rewritten)
		}
	}

	for _, source := range []string{"imdb", "tmdb"} {
		mux.HandleFunc("/{key}/"+source+"/{resource}/{id}", handlerFor(source))
	}
}

// rpdbIsValidMiddleware answers the key check AIOStreams makes before it will
// use a poster source. It sits ahead of the mux because "/{key}/isValid" and
// "/poster/{id}" are equally specific to Go's router, which refuses the pair.
func rpdbIsValidMiddleware(store *profile.Store, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key, ok := strings.CutSuffix(strings.TrimPrefix(r.URL.Path, "/"), "/isValid")
		if !ok || key == "" || strings.Contains(key, "/") || r.Method != http.MethodGet {
			next.ServeHTTP(w, r)
			return
		}
		valid := key == "default"
		if !valid && store != nil {
			_, err := store.Resolve(key)
			valid = err == nil
		}
		writeJSON(w, http.StatusOK, map[string]bool{"valid": valid})
	})
}
