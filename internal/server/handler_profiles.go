package server

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/migrate"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
)

// generateProfileID returns a short, URL-safe, unguessable profile ID.
func generateProfileID() string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

// registerProfileRoutes mounts all /profile/* handlers onto mux.
func registerProfileRoutes(mux *http.ServeMux, store *profile.Store, cfg config.Config) {
	mux.HandleFunc("/profile", func(w http.ResponseWriter, r *http.Request) {
		if cfg.APIKey != "" && !bearerMatches(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
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
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
			body, err := io.ReadAll(r.Body)
			if err != nil {
				var mbe *http.MaxBytesError
				if errors.As(err, &mbe) {
					http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
				} else {
					http.Error(w, "read body", http.StatusBadRequest)
				}
				return
			}
			var p profile.Profile
			if err := json.Unmarshal(body, &p); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			// Plaintext password rides alongside the profile fields; it is
			// hashed here and never stored or echoed back.
			var extra struct {
				Password string `json:"password"`
			}
			if err := json.Unmarshal(body, &extra); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if extra.Password != "" {
				hash, err := bcrypt.GenerateFromPassword([]byte(extra.Password), bcrypt.DefaultCost)
				if err != nil {
					http.Error(w, "failed to hash password", http.StatusInternalServerError)
					return
				}
				p.PasswordHash = string(hash)
			}
			if p.ID == "" {
				p.ID = generateProfileID()
			}
			if err := store.Save(&p); err != nil {
				switch {
				case errors.Is(err, profile.ErrConflict):
					http.Error(w, "profile already exists", http.StatusConflict)
				case errors.Is(err, profile.ErrAliasTaken):
					http.Error(w, "alias already in use", http.StatusConflict)
				case errors.Is(err, profile.ErrInvalidAlias):
					http.Error(w, err.Error(), http.StatusBadRequest)
				default:
					http.Error(w, "failed to save profile", http.StatusInternalServerError)
				}
				return
			}
			writeJSON(w, http.StatusCreated, &p)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/profile/{id}", func(w http.ResponseWriter, r *http.Request) {
		if cfg.APIKey != "" && !bearerMatches(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if store == nil {
			http.Error(w, "profile store unavailable", http.StatusServiceUnavailable)
			return
		}
		id := r.PathValue("id")
		switch r.Method {
		case http.MethodGet:
			// Accept either the generated ID or the memorable alias.
			p, err := store.Resolve(id)
			if err != nil {
				if errors.Is(err, profile.ErrNotFound) {
					http.Error(w, "not found", http.StatusNotFound)
					return
				}
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			if p.PasswordHash != "" {
				pw := r.Header.Get("X-Profile-Password")
				if err := store.CheckPassword(p.ID, pw); err != nil {
					http.Error(w, "profile password required", http.StatusUnauthorized)
					return
				}
			}
			writeJSON(w, http.StatusOK, p)
		case http.MethodPut:
			existing, err := store.Resolve(id)
			if err != nil {
				if errors.Is(err, profile.ErrNotFound) {
					http.Error(w, "not found", http.StatusNotFound)
					return
				}
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			if existing.PasswordHash != "" {
				pw := r.Header.Get("X-Profile-Password")
				if err := store.CheckPassword(existing.ID, pw); err != nil {
					http.Error(w, "profile password required", http.StatusUnauthorized)
					return
				}
			}
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
			body, err := io.ReadAll(r.Body)
			if err != nil {
				var mbe *http.MaxBytesError
				if errors.As(err, &mbe) {
					http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
					return
				}
				http.Error(w, "read body", http.StatusBadRequest)
				return
			}
			var p profile.Profile
			if err := json.Unmarshal(body, &p); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			// Optional plaintext password field: omitted → keep current,
			// "" → remove protection, value → replace. Alias follows the
			// same omitted-means-preserve rule.
			var extra struct {
				Password *string `json:"password"`
				Alias    *string `json:"alias"`
				// ProviderKeys is write-only: omitted keeps what is stored, a
				// named entry replaces it, and an empty value clears that one.
				ProviderKeys map[string]string `json:"providerKeys"`
			}
			if err := json.Unmarshal(body, &extra); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			p.ID = existing.ID
			p.PasswordHash = existing.PasswordHash
			if extra.Password != nil {
				p.PasswordHash = ""
				if *extra.Password != "" {
					hash, err := bcrypt.GenerateFromPassword([]byte(*extra.Password), bcrypt.DefaultCost)
					if err != nil {
						http.Error(w, "failed to hash password", http.StatusInternalServerError)
						return
					}
					p.PasswordHash = string(hash)
				}
			}
			if extra.Alias == nil {
				p.Alias = existing.Alias
			}
			// Credentials are only ever stored behind a password. An
			// unprotected profile is readable by anyone holding its id, so
			// keeping someone's API key on one would put it in the open.
			p.ProviderKeys = existing.ProviderKeys
			if extra.ProviderKeys != nil {
				if p.PasswordHash == "" {
					writeJSON(w, http.StatusConflict, map[string]string{
						"error": "Set a password on this profile before saving your own API keys.",
						"code":  "password_required",
					})
					return
				}
				merged := map[string]string{}
				for k, v := range existing.ProviderKeys {
					merged[k] = v
				}
				for k, v := range extra.ProviderKeys {
					if strings.TrimSpace(v) == "" {
						delete(merged, strings.ToLower(strings.TrimSpace(k)))
						continue
					}
					merged[strings.ToLower(strings.TrimSpace(k))] = v
				}
				p.ProviderKeys = provider.FilterSupported(merged)
			}
			// Removing the password takes the stored credentials with it.
			if p.PasswordHash == "" {
				p.ProviderKeys = nil
			}
			if err := store.Update(&p); err != nil {
				switch {
				case errors.Is(err, profile.ErrNotFound):
					http.Error(w, "not found", http.StatusNotFound)
				case errors.Is(err, profile.ErrAliasTaken):
					http.Error(w, "alias already in use", http.StatusConflict)
				case errors.Is(err, profile.ErrInvalidAlias):
					http.Error(w, err.Error(), http.StatusBadRequest)
				default:
					http.Error(w, "failed to update profile", http.StatusInternalServerError)
				}
				return
			}
			updated, err := store.Get(existing.ID)
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, updated)
		case http.MethodDelete:
			existing, err := store.Resolve(id)
			if err != nil {
				if errors.Is(err, profile.ErrNotFound) {
					http.Error(w, "not found", http.StatusNotFound)
					return
				}
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			if existing.PasswordHash != "" {
				pw := r.Header.Get("X-Profile-Password")
				if err := store.CheckPassword(existing.ID, pw); err != nil {
					http.Error(w, "profile password required", http.StatusUnauthorized)
					return
				}
			}
			if err := store.Delete(existing.ID); err != nil {
				if errors.Is(err, profile.ErrNotFound) {
					http.Error(w, "not found", http.StatusNotFound)
					return
				}
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/profile/{id}/export", func(w http.ResponseWriter, r *http.Request) {
		if cfg.APIKey != "" && !bearerMatches(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if store == nil {
			http.Error(w, "profile store unavailable", http.StatusServiceUnavailable)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := r.PathValue("id")
		// Resolve id-or-alias so export matches the other profile routes; the UI
		// exports by id, but a hand-built /profile/{alias}/export should work too.
		p, err := store.Resolve(id)
		if err != nil {
			if errors.Is(err, profile.ErrNotFound) {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if p.PasswordHash != "" {
			pw := r.Header.Get("X-Profile-Password")
			if err := store.CheckPassword(p.ID, pw); err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		}
		safeID := strings.NewReplacer(`"`, "_", "\n", "_", "\r", "_", `\`, "_", ";", "_").Replace(p.ID)
		env := profile.ExportEnvelope{Version: 1, Profiles: []profile.Profile{*p}}
		w.Header().Set("Content-Disposition", `attachment; filename="xrdb-profile-`+safeID+`.json"`)
		writeJSON(w, http.StatusOK, env)
	})

	mux.HandleFunc("/profile/import", func(w http.ResponseWriter, r *http.Request) {
		if cfg.APIKey != "" && !bearerMatches(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if store == nil {
			http.Error(w, "profile store unavailable", http.StatusServiceUnavailable)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			var mbe *http.MaxBytesError
			if errors.As(err, &mbe) {
				http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			} else {
				http.Error(w, "read body", http.StatusBadRequest)
			}
			return
		}
		var env profile.ExportEnvelope
		if err := json.Unmarshal(body, &env); err != nil {
			// Older migration output was a bare array of profiles rather than
			// an envelope. Accepting both means a file produced by any version
			// of the tool still imports.
			var bare []profile.Profile
			if bareErr := json.Unmarshal(body, &bare); bareErr != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			env = profile.ExportEnvelope{Version: 1, Profiles: bare}
		}
		type importResult struct {
			Imported int      `json:"imported"`
			Skipped  int      `json:"skipped"`
			Errors   []string `json:"errors,omitempty"`
		}
		var res importResult
		for i := range env.Profiles {
			p := &env.Profiles[i]
			// A v2 export can be posted here directly: its per-surface keys are
			// translated on the way in, and a config already in XRDB's shape is
			// left exactly as it is. That saves a migrating user from having to
			// run a separate tool before their profiles will render.
			if converted, _, err := migrate.ConvertConfig(p.Config); err == nil {
				p.Config = converted
			}
			// Idempotent by legacy uuid: a profile whose uuid is already present
			// is the same v2 config re-imported under a possibly different id, so
			// skip it rather than create a second profile for one identity. The
			// id-based conflict below covers re-imports that reuse the same id.
			if p.UUID != "" {
				switch _, err := store.GetByUUID(p.UUID); {
				case err == nil:
					res.Skipped++
					continue
				case !errors.Is(err, profile.ErrNotFound):
					res.Errors = append(res.Errors, p.ID+": failed to check for an existing profile")
					continue
				}
			}
			if err := store.Save(p); err != nil {
				if errors.Is(err, profile.ErrConflict) {
					res.Skipped++
					continue
				}
				res.Errors = append(res.Errors, p.ID+": failed to save")
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
}
