package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/migrate"
)

// registerMigrateRoutes mounts the config translation endpoint the configurator
// uses, so someone holding a v2 config can recover it without the CLI.
func registerMigrateRoutes(mux *http.ServeMux, cfg config.Config) {
	mux.HandleFunc("/api/migrate/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if cfg.APIKey != "" && !bearerMatches(r, cfg.APIKey) && !sameOriginRender(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}
		var req struct {
			// Input is whatever the user had: a v2 query string, a full v2
			// artwork URL, or the JSON config itself.
			Input string `json:"input"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}

		params, err := parseLegacyInput(req.Input)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		encoded, err := json.Marshal(params)
		if err != nil {
			http.Error(w, "encode params", http.StatusInternalServerError)
			return
		}

		converted, stats, err := migrate.ConvertConfig(encoded)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"config":    json.RawMessage(converted),
			"read":      len(params),
			"converted": stats.ConvertedFields,
			// Named so the UI can say which settings it could not carry, rather
			// than leaving someone to notice the gap themselves.
			"carriedUntouched": stats.UnreadableFields,
		})
	})
}

// parseLegacyInput reads the shapes someone actually has to hand: a whole v2
// artwork URL, a bare query string, or the JSON config.
func parseLegacyInput(input string) (map[string]string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, errEmptyInput
	}

	if strings.HasPrefix(input, "{") {
		var obj map[string]any
		if err := json.Unmarshal([]byte(input), &obj); err != nil {
			return nil, errUnreadable
		}
		out := make(map[string]string, len(obj))
		for k, v := range obj {
			switch t := v.(type) {
			case string:
				out[k] = t
			case nil:
				// A null carries nothing; skipping it keeps the default.
			default:
				// v2 wrote everything as a string, but a hand-edited export may
				// hold a real number or flag. Re-encode rather than reject.
				if b, err := json.Marshal(t); err == nil {
					out[k] = strings.Trim(string(b), `"`)
				}
			}
		}
		if len(out) == 0 {
			return nil, errNoSettings
		}
		return out, nil
	}

	// A full URL, or anything with a query string on it.
	if i := strings.IndexByte(input, '?'); i >= 0 {
		input = input[i+1:]
	}
	input = strings.TrimPrefix(input, "&")

	values, err := url.ParseQuery(input)
	if err != nil {
		return nil, errUnreadable
	}
	out := make(map[string]string, len(values))
	for k, v := range values {
		if len(v) > 0 && strings.TrimSpace(v[0]) != "" {
			out[k] = v[0]
		}
	}
	if len(out) == 0 {
		return nil, errNoSettings
	}
	return out, nil
}

type migrateError string

func (e migrateError) Error() string { return string(e) }

const (
	errEmptyInput migrateError = "Paste a v2 artwork URL, its query string, or the config JSON."
	errUnreadable migrateError = "That could not be read as a URL, query string or JSON."
	errNoSettings migrateError = "No settings found in that input."
)
