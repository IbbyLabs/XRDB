package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"xrdb_rewrite/internal/profile"
)

// registerProfileRoutes mounts all /profile/* handlers onto mux.
func registerProfileRoutes(mux *http.ServeMux, store *profile.Store) {
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
				http.Error(w, "failed to save profile", http.StatusInternalServerError)
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
				http.Error(w, "failed to update profile", http.StatusInternalServerError)
				return
			}
			updated, err := store.Get(id)
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, updated)
		case http.MethodDelete:
			if err := store.Delete(id); err != nil {
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
}
