package server

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/logging"
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
func registerProfileRoutes(mux *http.ServeMux, store *profile.Store, cfg config.Config, logger *slog.Logger, signer *previewSigner) {
	if logger == nil {
		logger = slog.Default()
	}
	trust := newProxyTrust(cfg.TrustedProxies, cfg.TrustProxyHeaders)
	passwordLimiter := newWindowLimiter(profilePasswordChecksPerMinute, time.Minute)
	createLimiter := newWindowLimiter(profileCreatesPerHour, time.Hour)
	importLimiter := newWindowLimiter(profileImportsPerHour, time.Hour)
	callerKey := func(r *http.Request) string { return "ip:" + capAddressKey(clientIP(r, trust)) }

	// authorize rate-limits and runs one password check, answering the request
	// itself when it refuses.
	authorize := func(w http.ResponseWriter, r *http.Request, id, refusal string) bool {
		key := callerKey(r)
		if ok, _ := passwordLimiter.allow(1, key); !ok {
			logger.WarnContext(r.Context(), "Refused a profile password check over the rate limit",
				"id", logging.RequestID(r.Context()), "client_ip", clientIP(r, trust))
			refuseRateLimited(w, passwordLimiter, key)
			return false
		}
		if err := store.CheckPassword(id, r.Header.Get("X-Profile-Password")); err != nil {
			http.Error(w, refusal, http.StatusUnauthorized)
			return false
		}
		return true
	}
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
			// Listing every profile is an operator action and takes the admin key.
			// It carries its own check because the gate above also covers the POST
			// that creates a profile, which ordinary users reach.
			if cfg.AdminKey == "" || !bearerMatches(r, cfg.AdminKey) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
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
			if extra.Password == "" {
				http.Error(w, "A password is required to create a profile.", http.StatusBadRequest)
				return
			}
			key := callerKey(r)
			if ok, _ := createLimiter.allow(1, key); !ok {
				logger.WarnContext(r.Context(), "Refused a profile creation over the rate limit",
					"id", logging.RequestID(r.Context()), "client_ip", clientIP(r, trust))
				refuseRateLimited(w, createLimiter, key)
				return
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(extra.Password), bcrypt.DefaultCost)
			if err != nil {
				http.Error(w, "failed to hash password", http.StatusInternalServerError)
				return
			}
			p.PasswordHash = string(hash)
			p.ID = generateProfileID()
			if err := store.Save(&p); err != nil {
				switch {
				case errors.Is(err, profile.ErrConflict):
					http.Error(w, "profile already exists", http.StatusConflict)
				case errors.Is(err, profile.ErrAliasTaken):
					http.Error(w, "alias already in use", http.StatusConflict)
				case errors.Is(err, profile.ErrInvalidAlias), errors.Is(err, profile.ErrInvalidProfile):
					http.Error(w, err.Error(), http.StatusBadRequest)
				default:
					logger.ErrorContext(r.Context(), "Failed to save a new profile",
						"id", logging.RequestID(r.Context()), "error", err)
					http.Error(w, "failed to save profile", http.StatusInternalServerError)
				}
				return
			}
			writeJSON(w, http.StatusCreated, withPreviewToken(&p, signer))
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
				if !authorize(w, r, p.ID, "profile password required") {
					return
				}
			} else {
				p.Config = withoutV2Credentials(p.Config)
			}
			resp := withPreviewToken(p, signer)
			resp.PasswordRequired = p.PasswordHash == ""
			writeJSON(w, http.StatusOK, resp)
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
				if !authorize(w, r, existing.ID, "profile password required") {
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
				// Omitted keeps the stored preview; an object with no fields
				// clears it. Without this an update that does not mention the
				// preview would drop it, and every autosave is such an update.
				Preview *profile.Preview `json:"preview"`
			}
			if err := json.Unmarshal(body, &extra); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			p.ID = existing.ID
			p.PasswordHash = existing.PasswordHash
			if extra.Password != nil {
				if *extra.Password == "" && existing.PasswordHash != "" {
					http.Error(w, "A profile's password can be changed but not removed.", http.StatusBadRequest)
					return
				}
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
			if extra.Preview == nil {
				p.Preview = existing.Preview
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
				// Credentials are encrypted at rest, so a server with no key
				// configured says so rather than storing them in the clear.
				if !store.CanStoreSecrets() {
					writeJSON(w, http.StatusServiceUnavailable, map[string]string{
						"error": "This server is not configured to store API keys. Its own keys are used for every render.",
						"code":  "secrets_unavailable",
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
				// Check the shape now, while the person can still fix the
				// field, rather than letting a mistyped key fail on every
				// later render with nothing saying why.
				if err := provider.ValidateKeys(p.ProviderKeys); err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{
						"error": sentence(err.Error()),
						"code":  "invalid_key",
					})
					return
				}
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
				case errors.Is(err, profile.ErrInvalidAlias), errors.Is(err, profile.ErrInvalidProfile):
					http.Error(w, err.Error(), http.StatusBadRequest)
				default:
					logger.ErrorContext(r.Context(), "Failed to update a profile",
						"id", logging.RequestID(r.Context()), "profile_id", existing.ID, "error", err)
					http.Error(w, "failed to update profile", http.StatusInternalServerError)
				}
				return
			}
			updated, err := store.Get(existing.ID)
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			if updated.PasswordHash == "" {
				updated.Config = withoutV2Credentials(updated.Config)
			}
			resp := withPreviewToken(updated, signer)
			resp.PasswordRequired = updated.PasswordHash == ""
			writeJSON(w, http.StatusOK, resp)
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
				if !authorize(w, r, existing.ID, "profile password required") {
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
			if !authorize(w, r, p.ID, "unauthorized") {
				return
			}
		} else {
			p.Config = withoutV2Credentials(p.Config)
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
		key := callerKey(r)
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
		if len(env.Profiles) > profileImportMax {
			logger.WarnContext(r.Context(), "Refused a profile import with too many profiles",
				"id", logging.RequestID(r.Context()), "profiles", len(env.Profiles), "max", profileImportMax)
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{
				"error": "An import can carry at most " + strconv.Itoa(profileImportMax) + " profiles. Split the file and import the rest separately."})
			return
		}
		if len(env.Profiles) > 0 {
			if ok, _ := importLimiter.allow(int64(len(env.Profiles)), key); !ok {
				logger.WarnContext(r.Context(), "Refused a profile import over the import rate limit",
					"id", logging.RequestID(r.Context()), "client_ip", clientIP(r, trust), "profiles", len(env.Profiles))
				refuseRateLimited(w, importLimiter, key)
				return
			}
		}
		// An export carries no password hash, so each profile names a plaintext
		// password here, or inherits the envelope's.
		passwords := importPasswords(body, len(env.Profiles))
		hashes := map[string]string{}
		type importResult struct {
			Imported int      `json:"imported"`
			Skipped  int      `json:"skipped"`
			Errors   []string `json:"errors,omitempty"`
		}
		var res importResult
		for i := range env.Profiles {
			if err := r.Context().Err(); err != nil {
				logger.WarnContext(r.Context(), "Stopped a profile import because the request ended",
					"id", logging.RequestID(r.Context()), "done", i, "profiles", len(env.Profiles))
				return
			}
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
					logger.ErrorContext(r.Context(), "Failed to check whether an imported profile already exists",
						"id", logging.RequestID(r.Context()), "profile_id", p.ID, "error", err)
					res.Errors = append(res.Errors, p.ID+": failed to check for an existing profile")
					continue
				}
			}
			p.PasswordHash = ""
			// Cheap checks first, so an invalid profile costs no bcrypt.
			if passwords[i] == "" {
				res.Errors = append(res.Errors, p.ID+": a password is required")
				continue
			}
			if err := store.Validate(p); err != nil {
				res.Errors = append(res.Errors, p.ID+": "+err.Error())
				continue
			}
			if pw := passwords[i]; pw != "" {
				hash, ok := hashes[pw]
				if !ok {
					h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
					if err != nil {
						logger.ErrorContext(r.Context(), "Failed to hash an imported profile password",
							"id", logging.RequestID(r.Context()), "profile_id", p.ID, "error", err)
						res.Errors = append(res.Errors, p.ID+": failed to save")
						continue
					}
					hash = string(h)
					hashes[pw] = hash
				}
				p.PasswordHash = hash
			}
			if p.PasswordHash == "" {
				res.Errors = append(res.Errors, p.ID+": a password is required")
				continue
			}
			if err := store.Save(p); err != nil {
				switch {
				case errors.Is(err, profile.ErrConflict):
					res.Skipped++
				case errors.Is(err, profile.ErrAliasTaken):
					// The alias index is checked before the id index, so a
					// profile colliding on both reports the alias.
					if _, getErr := store.Get(p.ID); getErr == nil {
						res.Skipped++
						break
					}
					logger.WarnContext(r.Context(), "Refused an imported profile whose alias belongs to another profile",
						"id", logging.RequestID(r.Context()), "profile_id", p.ID, "alias", p.Alias)
					res.Errors = append(res.Errors,
						p.ID+": alias \""+p.Alias+"\" is already used by a different profile")
				default:
					logger.ErrorContext(r.Context(), "Failed to save an imported profile",
						"id", logging.RequestID(r.Context()), "profile_id", p.ID, "error", err)
					res.Errors = append(res.Errors, p.ID+": failed to save")
				}
				continue
			}
			res.Imported++
		}
		status := http.StatusOK
		if res.Imported == 0 && len(res.Errors) > 0 {
			status = http.StatusUnprocessableEntity
		}
		logger.InfoContext(r.Context(), "Imported a profile export",
			"id", logging.RequestID(r.Context()), "submitted", len(env.Profiles),
			"imported", res.Imported, "skipped", res.Skipped, "errors", len(res.Errors))
		writeJSON(w, status, res)
	})
}

// importPasswords returns the plaintext password for each of n imported
// profiles: its own "password" field, else the envelope's.
func importPasswords(body []byte, n int) []string {
	type entry struct {
		Password string `json:"password"`
	}
	var env struct {
		Password string  `json:"password"`
		Profiles []entry `json:"profiles"`
	}
	var bare []entry
	var shared string
	var own []entry
	if err := json.Unmarshal(body, &env); err == nil {
		shared, own = env.Password, env.Profiles
	} else if err := json.Unmarshal(body, &bare); err == nil {
		own = bare
	}
	out := make([]string, n)
	for i := range out {
		out[i] = shared
		if i < len(own) && own[i].Password != "" {
			out[i] = own[i].Password
		}
	}
	return out
}

// profileResponse is a profile plus the fields only the profile routes add.
type profileResponse struct {
	*profile.Profile
	// PreviewToken lets the configurator's preview render with this profile's
	// own provider keys (query parameter pkt).
	PreviewToken string `json:"previewToken,omitempty"`
	// PasswordRequired marks a profile that has no password, which the owner
	// is asked to set. Present on reads and saves.
	PasswordRequired bool `json:"passwordRequired,omitempty"`
}

// A preview token lets a render borrow the profile's provider keys, so only a
// password-protected profile, the only kind that can hold keys, gets one.
func withPreviewToken(p *profile.Profile, signer *previewSigner) *profileResponse {
	resp := &profileResponse{Profile: p}
	if p.PasswordHash != "" {
		resp.PreviewToken = signer.issue(p.ID)
	}
	return resp
}

// withoutV2Credentials drops v2 credential keys at any depth of a config.
// A config that does not parse is returned unchanged.
func withoutV2Credentials(cfg json.RawMessage) json.RawMessage {
	var v any
	if err := json.Unmarshal(cfg, &v); err != nil {
		return cfg
	}
	if !stripV2Credentials(v) {
		return cfg
	}
	out, err := json.Marshal(v)
	if err != nil {
		return cfg
	}
	return out
}

func stripV2Credentials(v any) bool {
	changed := false
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			if migrate.IsCredentialField(k) {
				delete(t, k)
				changed = true
				continue
			}
			changed = stripV2Credentials(child) || changed
		}
	case []any:
		for _, child := range t {
			changed = stripV2Credentials(child) || changed
		}
	}
	return changed
}

// sentence capitalizes a message for display. Go error strings are lowercase by
// convention, but these are shown to the person who typed the value.
func sentence(msg string) string {
	if msg == "" {
		return msg
	}
	r := []rune(msg)
	return string(unicode.ToUpper(r[0])) + string(r[1:])
}
