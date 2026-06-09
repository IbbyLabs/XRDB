package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/server"
	"xrdb_rewrite/internal/settings"
	"xrdb_rewrite/internal/ui"
)

// applySettingsOverrides reads persisted API keys from the settings store and
// overlays them onto cfg, so keys saved via the UI take effect on (re)start.
func applySettingsOverrides(cfg *config.Config, s *settings.Store) {
	type mapping struct {
		key  string
		dest *string
	}
	mappings := []mapping{
		{"tmdb_read_token", &cfg.TMDBReadToken},
		{"tmdb_api_key", &cfg.TMDBAPIKey},
		{"mdblist_api_key", &cfg.MDBListAPIKey},
		{"omdb_api_key", &cfg.OMDBAPIKey},
		{"fanart_api_key", &cfg.FanartAPIKey},
		{"trakt_client_id", &cfg.TraktClientID},
		{"simkl_client_id", &cfg.SIMKLClientID},
	}
	for _, m := range mappings {
		if v, err := s.Get(m.key); err == nil && v != "" {
			*m.dest = v
		}
	}
}

func main() {
	cfg := config.Load()

	store, err := profile.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open profile store: %v", err)
	}
	defer func() { _ = store.Close() }()

	settingsStore, err := settings.Open(cfg.DBPath + ".settings")
	if err != nil {
		log.Printf("warn: could not open settings store: %v", err)
	}
	if settingsStore != nil {
		defer func() { _ = settingsStore.Close() }()
		// Overlay settings-store keys on top of env vars so UI-configured keys
		// take precedence without requiring an env change.
		applySettingsOverrides(&cfg, settingsStore)
	}

	reg := provider.NewRegistry()
	if cfg.TMDBAPIKey != "" || cfg.TMDBReadToken != "" {
		reg.Register(provider.NewTMDB(cfg.TMDBAPIKey, cfg.TMDBReadToken))
	}
	if cfg.MDBListAPIKey != "" {
		reg.Register(provider.NewMDBList(cfg.MDBListAPIKey))
	}
	if cfg.OMDBAPIKey != "" {
		reg.Register(provider.NewOMDB(cfg.OMDBAPIKey))
	}
	if cfg.FanartAPIKey != "" {
		reg.Register(provider.NewFanart(cfg.FanartAPIKey))
	}
	if cfg.TraktClientID != "" {
		reg.Register(provider.NewTrakt(cfg.TraktClientID))
	}
	if cfg.SIMKLClientID != "" {
		reg.Register(provider.NewSIMKL(cfg.SIMKLClientID))
	}
	// IMDb local dataset — enabled when XRDB_IMDB_DATASET_DIR is set.
	if cfg.IMDbDatasetDir != "" {
		reg.Register(provider.NewIMDbDataset(cfg.IMDbDatasetDir))
	}
	// Anime providers — public APIs, no key required.
	reg.Register(provider.NewMAL())
	reg.Register(provider.NewAniList())
	reg.Register(provider.NewKitsu())
	var pipeline *compose.Pipeline
	if len(reg.Names()) > 0 {
		pipeline = compose.New(reg)
	}

	renderCache, err := cache.New(cfg.CacheDir, cfg.CacheTTL, 300)
	if err != nil {
		log.Fatalf("open render cache: %v", err)
	}

	handler := server.NewHandler(cfg.Version, store, settingsStore, pipeline, renderCache, cfg, ui.FS())

	srv := &http.Server{
		Addr:              cfg.Address,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("api listening on %s", cfg.Address)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
