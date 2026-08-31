package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/folderwriter"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/profile"
)

// pipelineRenderer adapts the render pipeline to the narrow interface the
// folder writer needs, resolving the configured profile so library artwork
// looks like everything else the instance serves.
type pipelineRenderer struct {
	pipeline  *compose.Pipeline
	store     *profile.Store
	configKey string
}

func (p *pipelineRenderer) RenderArtwork(ctx context.Context, mediaType, contentType, mediaID string) ([]byte, bool, error) {
	if p.pipeline == nil {
		return nil, false, errors.New("no render pipeline configured")
	}
	cfg := imageconfig.Default()
	if p.configKey != "" && p.store != nil {
		if prof, err := p.store.Resolve(p.configKey); err == nil {
			cfg = imageconfig.ParseSurface(prof.Config, mediaType)
		}
	}
	res, err := p.pipeline.Render(ctx, compose.Request{
		MediaType:   mediaType,
		ContentType: contentType,
		MediaID:     mediaID,
		Config:      cfg,
	})
	if err != nil {
		return nil, false, err
	}
	if res == nil {
		return nil, true, nil
	}
	return res.ImageBytes, res.Placeholder, nil
}

// sharedFolderWriter is the process-wide pass tracker. There is one library and
// one writer per process, and both the HTTP trigger and the schedule have to
// see the same "already running" state, so it is held here rather than threaded
// through a constructor signature that every test would then have to change.
var sharedFolderWriter = &folderWriterRunner{}

// folderWriterRunner serialises passes. Two concurrent walks over the same
// library would duplicate every render for no benefit, so a pass already in
// flight is reported rather than started twice.
type folderWriterRunner struct {
	mu      sync.Mutex
	running bool
	last    *folderwriter.Report
	lastRun time.Time
}

func (f *folderWriterRunner) begin() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.running {
		return false
	}
	f.running = true
	return true
}

func (f *folderWriterRunner) finish(rep folderwriter.Report) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.running = false
	f.last = &rep
	f.lastRun = time.Now()
}

func (f *folderWriterRunner) snapshot() (bool, *folderwriter.Report, time.Time) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.running, f.last, f.lastRun
}

// optionsFrom builds the writer options from config.
func optionsFrom(cfg config.Config, dryRun bool) folderwriter.Options {
	return folderwriter.Options{
		Roots:     cfg.LibraryRoots,
		Surfaces:  cfg.FolderWriterSurfaces,
		DryRun:    dryRun,
		Overwrite: cfg.FolderWriterOverwrite,
		Pace:      cfg.FolderWriterPace,
	}
}

// registerFolderWriterRoutes mounts the manual trigger and status endpoint.
func registerFolderWriterRoutes(
	mux *http.ServeMux,
	cfg config.Config,
	pipeline *compose.Pipeline,
	store *profile.Store,
) {
	runner := sharedFolderWriter
	mux.HandleFunc("/api/admin/folder-writer", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if cfg.AdminKey == "" || !bearerMatches(r, cfg.AdminKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		type status struct {
			Enabled bool                 `json:"enabled"`
			Roots   []string             `json:"roots"`
			Running bool                 `json:"running"`
			LastRun string               `json:"lastRun,omitempty"`
			Last    *folderwriter.Report `json:"lastReport,omitempty"`
		}
		running, last, lastRun := runner.snapshot()

		if r.Method == http.MethodGet {
			st := status{Enabled: cfg.FolderWriter, Roots: cfg.LibraryRoots, Running: running, Last: last}
			if !lastRun.IsZero() {
				st.LastRun = lastRun.UTC().Format(time.RFC3339)
			}
			writeJSON(w, http.StatusOK, st)
			return
		}

		if !cfg.FolderWriter {
			http.Error(w, "folder writer is disabled; set XRDB_FOLDER_WRITER=true", http.StatusConflict)
			return
		}
		if len(cfg.LibraryRoots) == 0 {
			http.Error(w, "no library roots configured; set XRDB_LIBRARY_ROOTS", http.StatusConflict)
			return
		}
		// A dry run is the default for a manual trigger: the first thing an
		// operator should see is what would change, not what did.
		dryRun := r.URL.Query().Get("apply") != "true"
		if !runner.begin() {
			http.Error(w, "a pass is already running", http.StatusConflict)
			return
		}

		rep, err := folderwriter.Run(r.Context(), &pipelineRenderer{
			pipeline: pipeline, store: store, configKey: cfg.FolderWriterProfile,
		}, optionsFrom(cfg, dryRun), slog.Default())
		runner.finish(rep)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(), "report": rep,
			})
			return
		}
		writeJSON(w, http.StatusOK, rep)
	})
}

// StartFolderWriterSchedule runs a pass on an interval. It is what makes the
// artwork in a library follow a profile edit without anyone re-triggering it.
// A zero interval disables the schedule; a manual trigger still works.
func StartFolderWriterSchedule(
	ctx context.Context,
	cfg config.Config,
	pipeline *compose.Pipeline,
	store *profile.Store,
	logger *slog.Logger,
) {
	runner := sharedFolderWriter
	if !cfg.FolderWriter || cfg.FolderWriterInterval <= 0 || len(cfg.LibraryRoots) == 0 {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	go func() {
		ticker := time.NewTicker(cfg.FolderWriterInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if !runner.begin() {
					logger.InfoContext(ctx, "Skipped a scheduled library pass; one is already running")
					continue
				}
				rep, err := folderwriter.Run(ctx, &pipelineRenderer{
					pipeline: pipeline, store: store, configKey: cfg.FolderWriterProfile,
				}, optionsFrom(cfg, false), logger)
				runner.finish(rep)
				if err != nil && !errors.Is(err, context.Canceled) {
					logger.ErrorContext(ctx, "A scheduled library pass failed", "error", err)
				}
			}
		}
	}()
}
