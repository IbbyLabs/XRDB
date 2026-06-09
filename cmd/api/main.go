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
)

func main() {
	cfg := config.Load()

	store, err := profile.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open profile store: %v", err)
	}
	defer func() { _ = store.Close() }()

	reg := provider.NewRegistry()
	if cfg.TMDBAPIKey != "" || cfg.TMDBReadToken != "" {
		reg.Register(provider.NewTMDB(cfg.TMDBAPIKey, cfg.TMDBReadToken))
	}
	var pipeline *compose.Pipeline
	if len(reg.Names()) > 0 {
		pipeline = compose.New(reg)
	}

	renderCache, err := cache.New(cfg.CacheDir, cfg.CacheTTL, 300)
	if err != nil {
		log.Fatalf("open render cache: %v", err)
	}

	handler := server.NewHandler(cfg.Version, store, pipeline, renderCache)

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
