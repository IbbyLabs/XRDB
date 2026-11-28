package server

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/watchprogress"
)

// traktAPIBase and traktAuthBase are empty in production, meaning Trakt's own
// hosts. Tests point them at a stub.
var (
	traktAPIBase  = ""
	traktAuthBase = ""
)

// traktLinkStartsPerHour caps device sign-ins started per client address.
const traktLinkStartsPerHour = 10

// profileAuthorizer runs one rate-limited password check for a profile,
// answering the request itself when it refuses.
type profileAuthorizer func(w http.ResponseWriter, r *http.Request, id, refusal string) bool

func newWatchService(version string, cfg config.Config, store *profile.Store, logger *slog.Logger) *watchprogress.Service {
	var tokens watchprogress.TokenStore
	if store != nil {
		tokens = store
	}
	svc := watchprogress.New(tokens, watchprogress.Options{
		ClientID:     cfg.TraktClientID,
		ClientSecret: cfg.TraktClientSecret,
		RedirectURI:  cfg.TraktRedirectURI,
		UserAgent:    "XRDB/" + strings.TrimPrefix(strings.TrimSpace(version), "v"),
		APIBase:      traktAPIBase,
		AuthBase:     traktAuthBase,
		Logger:       logger,
	})
	logger.Info("Configured watched progress from Trakt",
		"available", svc.Available(),
		"client_id_set", cfg.TraktClientID != "",
		"client_secret_set", cfg.TraktClientSecret != "",
		"secrets_storable", store != nil && store.CanStoreSecrets())
	return svc
}

// watchedKeyPart is the render cache key term for a bar drawn for one owner:
// a digest of the profile id with the drawn percent.
func watchedKeyPart(profileID string, pct int) string {
	if pct <= 0 {
		return ""
	}
	sum := sha256.Sum256([]byte("watched|" + profileID))
	return hex.EncodeToString(sum[:8]) + ":" + strconv.Itoa(pct)
}

// ownerRequest reports whether a render's config parameter is the profile's own
// id, as opposed to its alias, its legacy uuid or a shared profile. Only that
// form carries the owner's watched progress.
func ownerRequest(configParam string, p *profile.Profile, shared map[string]bool) bool {
	if p == nil || configParam == "" || configParam != p.ID {
		return false
	}
	return !shared[strings.ToLower(configParam)] && !shared[strings.ToLower(p.ID)]
}

func registerTraktRoutes(mux *http.ServeMux, store *profile.Store, cfg config.Config, logger *slog.Logger, svc *watchprogress.Service, authorize profileAuthorizer) {
	trust := newProxyTrust(cfg.TrustedProxies, cfg.TrustProxyHeaders)
	startLimiter := newWindowLimiter(traktLinkStartsPerHour, time.Hour)

	// owner loads the profile named in the path and checks its password.
	owner := func(w http.ResponseWriter, r *http.Request) (*profile.Profile, bool) {
		if cfg.APIKey != "" && !bearerMatches(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return nil, false
		}
		if store == nil {
			http.Error(w, "profile store unavailable", http.StatusServiceUnavailable)
			return nil, false
		}
		p, err := store.Resolve(r.PathValue("id"))
		if err != nil {
			if errors.Is(err, profile.ErrNotFound) {
				http.Error(w, "not found", http.StatusNotFound)
				return nil, false
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return nil, false
		}
		if p.PasswordHash == "" {
			writeJSON(w, http.StatusConflict, map[string]string{
				"error": "Set a password on this profile before linking Trakt.",
				"code":  "password_required",
			})
			return nil, false
		}
		if !authorize(w, r, p.ID, "profile password required") {
			return nil, false
		}
		return p, true
	}
	available := func(w http.ResponseWriter) bool {
		if svc.Available() {
			return true
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "This server is not set up to link Trakt accounts.",
			"code":  "trakt_unavailable",
		})
		return false
	}
	traktFailed := func(w http.ResponseWriter, r *http.Request, p *profile.Profile, action string, err error) {
		logger.WarnContext(r.Context(), "A Trakt link request failed",
			"id", logging.RequestID(r.Context()), "profile_id", p.ID, "action", action, "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error": "Trakt could not be reached. Try again shortly.",
			"code":  "trakt_failed",
		})
	}

	mux.HandleFunc("/profile/{id}/trakt", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodDelete:
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p, ok := owner(w, r)
		if !ok {
			return
		}
		if r.Method == http.MethodDelete {
			if !available(w) {
				return
			}
			if err := svc.Unlink(r.Context(), p.ID); err != nil {
				logger.ErrorContext(r.Context(), "Failed to unlink a profile from Trakt",
					"id", logging.RequestID(r.Context()), "profile_id", p.ID, "error", err)
				http.Error(w, "failed to unlink Trakt", http.StatusInternalServerError)
				return
			}
		}
		st, err := svc.StatusOf(p.ID)
		if err != nil {
			logger.ErrorContext(r.Context(), "Failed to read a profile's Trakt link",
				"id", logging.RequestID(r.Context()), "profile_id", p.ID, "error", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, st)
	})

	mux.HandleFunc("/profile/{id}/trakt-link", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p, ok := owner(w, r)
		if !ok || !available(w) {
			return
		}
		key := "ip:" + capAddressKey(clientIP(r, trust))
		if ok, _ := startLimiter.allow(1, key); !ok {
			logger.WarnContext(r.Context(), "Refused a Trakt link over the rate limit",
				"id", logging.RequestID(r.Context()), "client_ip", clientIP(r, trust))
			refuseRateLimited(w, startLimiter, key)
			return
		}
		start, err := svc.StartLink(r.Context(), p.ID)
		if err != nil {
			traktFailed(w, r, p, "start", err)
			return
		}
		logger.InfoContext(r.Context(), "Started a Trakt link",
			"id", logging.RequestID(r.Context()), "profile_id", p.ID, "expires_in_s", start.ExpiresIn)
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, start)
	})

	mux.HandleFunc("/profile/{id}/trakt-poll", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p, ok := owner(w, r)
		if !ok || !available(w) {
			return
		}
		state, err := svc.PollLink(r.Context(), p.ID)
		if err != nil {
			traktFailed(w, r, p, "poll", err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]string{"state": state})
	})
}
