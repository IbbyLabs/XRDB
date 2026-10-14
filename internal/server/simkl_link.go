package server

import (
	"context"
	"log/slog"
	"net/http"
	"sync/atomic"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/provider"
)

// simklLinker is what the link endpoint needs from the SIMKL provider.
type simklLinker interface {
	V2Enabled() bool
	StartLink(ctx context.Context) (provider.SIMKLLinkStart, error)
	LinkStatus() provider.SIMKLLinkStatus
}

var activeSIMKLLinker atomic.Pointer[simklLinker]

// SetSIMKLLinker names the provider the SIMKL link endpoint drives.
func SetSIMKLLinker(l simklLinker) {
	activeSIMKLLinker.Store(&l)
}

// registerSIMKLLinkRoute mounts the endpoint that links SIMKL V2: POST starts a
// device flow and returns the code to approve, GET reports the link.
func registerSIMKLLinkRoute(mux *http.ServeMux, cfg config.Config) {
	mux.HandleFunc("/api/admin/simkl/link", func(w http.ResponseWriter, r *http.Request) {
		if cfg.AdminKey == "" || !bearerMatches(r, cfg.AdminKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var linker simklLinker
		if p := activeSIMKLLinker.Load(); p != nil {
			linker = *p
		}
		if linker == nil || !linker.V2Enabled() {
			http.Error(w, "SIMKL V2 is not configured", http.StatusConflict)
			return
		}
		if r.Method == http.MethodGet {
			writeJSON(w, http.StatusOK, linker.LinkStatus())
			return
		}
		start, err := linker.StartLink(r.Context())
		if err != nil {
			slog.WarnContext(r.Context(), "Could not start a Simkl link", "error", err)
			http.Error(w, "could not start a SIMKL link", http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, start)
	})
}
