package main

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strconv"
	"strings"
	"syscall"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/provider/animemap"
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
	// A level chosen through the admin API outlives the restart that would
	// otherwise drop it back to XRDB_LOG_LEVEL. Reject a stored value that no
	// longer parses rather than starting up quieter than the operator expects.
	if v, err := s.Get(settings.LogLevelKey); err == nil && v != "" {
		if logging.SetLevel(v) {
			cfg.LogLevel = v
		} else {
			slog.Warn("Ignored an unrecognised stored log level", "stored", v, "level", logging.LevelName())
		}
	}
	// A memory limit chosen through the admin API likewise wins over the env var
	// on restart. Stored as whole MiB; 0 means the operator turned the limit off.
	if v, err := s.Get(settings.MemoryLimitKey); err == nil && v != "" {
		if mb, perr := strconv.ParseInt(v, 10, 64); perr == nil && mb >= 0 && mb <= math.MaxInt64>>20 {
			cfg.MemoryLimitBytes = mb << 20
		} else {
			slog.Warn("Ignored an unparseable stored memory limit", "stored", v)
		}
	}
	// Per-provider TTLs chosen through the admin API win over the env defaults on
	// restart. Stored as hours under "ttl_<provider>".
	for name := range cfg.ProviderTTLs {
		v, err := s.Get(settings.TTLKey(name))
		if err != nil || v == "" {
			continue
		}
		if h, perr := strconv.ParseFloat(v, 64); perr == nil && h >= 0 {
			cfg.ProviderTTLs[name] = time.Duration(h * float64(time.Hour))
		} else {
			slog.Warn("Ignored an unparseable stored provider TTL", "provider", name, "stored", v)
		}
	}
}

func main() {
	cfg := config.Load()

	logger := logging.New(cfg.LogLevel)
	slog.SetDefault(logger)

	if cfg.DBPath == "" {
		logger.Error("Database path is empty; set XRDB_DB")
		os.Exit(1)
	}

	store, err := profile.Open(cfg.DBPath)
	if err != nil {
		logger.Error("Failed to open the profile store", "error", err)
		os.Exit(1)
	}
	defer func() { _ = store.Close() }()
	// Owner-supplied provider credentials are encrypted at rest. Without a key
	// the store refuses to hold them rather than writing them in the clear.
	if err := store.SetEncryptionKey(cfg.ConfigEncryptionKey); err != nil {
		logger.Error("Failed to install the config encryption key", "error", err)
		os.Exit(1)
	}
	if !store.CanStoreSecrets() {
		logger.Warn("No XRDB_CONFIG_ENCRYPTION_KEY is set, so profiles cannot store their own provider API keys",
			"effect", "requests to save a key are refused; every render uses the server's keys")
	}

	settingsStore, err := settings.Open(cfg.DBPath + ".settings")
	if err != nil {
		logger.Warn("Could not open the settings store", "error", err)
	}
	if settingsStore != nil {
		defer func() { _ = settingsStore.Close() }()
		// Overlay settings-store keys on top of env vars so UI-configured keys
		// take precedence without requiring an env change.
		applySettingsOverrides(&cfg, settingsStore)
	}

	// Apply the effective memory limit after the settings overlay, so a value
	// saved through the admin API wins over XRDB_MEMORY_LIMIT_MB. Keeping the Go
	// heap under the container cap makes GC run before a kernel OOM-kill;
	// GOMEMLIMIT is also honoured natively.
	if cfg.MemoryLimitBytes > 0 {
		debug.SetMemoryLimit(cfg.MemoryLimitBytes)
	}

	reg := provider.NewRegistry()
	// Register every keyed provider unconditionally, even without a key at boot.
	// Each stays dormant until it has a credential (the render path skips a
	// provider whose HasCredentials is false), so a key added through the admin
	// UI activates its provider live without a restart or re-registration.
	reg.Register(provider.NewTMDB(cfg.TMDBAPIKey, cfg.TMDBReadToken))
	reg.Register(provider.NewMDBList(cfg.MDBListAPIKey))
	reg.Register(provider.NewOMDB(cfg.OMDBAPIKey))
	reg.Register(provider.NewFanart(cfg.FanartAPIKey))
	reg.Register(provider.NewTrakt(cfg.TraktClientID))
	reg.Register(provider.NewSIMKL(cfg.SIMKLClientID))
	// IMDb local dataset — enabled when XRDB_IMDB_DATASET_DIR is set.
	if cfg.IMDbDatasetDir != "" {
		imdbDataset := provider.NewIMDbDataset(cfg.IMDbDatasetDir)
		if cfg.IMDbTopRated {
			imdbDataset.EnableTopRated()
		}
		reg.Register(imdbDataset)
	}
	// Anime providers — public APIs, no key required. Wrapped with the anime
	// ID mapper so IMDb/TMDB render IDs resolve to MAL/AniList/Kitsu IDs.
	animeMapper := animemap.New(animemap.Options{
		CacheDir:      cfg.CacheDir,
		DatasetURL:    cfg.AnimeMapURL,
		FallbackURL:   cfg.AnimeMapFallbackURL,
		SupplementURL: cfg.AnimeMapSupplementURL,
		TTL:           cfg.AnimeMapRefresh,
	})
	reg.Register(provider.NewAnimeMapped(provider.NewMALWithURL(cfg.JikanURL), animeMapper))
	reg.Register(provider.NewAnimeMapped(provider.NewAniList(), animeMapper))
	reg.Register(provider.NewAnimeMapped(provider.NewKitsu(), animeMapper))
	// Cinemeta (Stremio) — public artwork/metadata, no key required.
	reg.Register(provider.NewCinemeta())
	// AlloCiné and Filmweb publish no API, so both are matched by title on their
	// own sites. Each declares the sources it serves and is only called when one
	// of them is selected, so an unused source costs nothing.
	reg.Register(provider.NewAlloCine())
	reg.Register(provider.NewFilmweb())

	logProviderReadiness(reg)

	var pipeline *compose.Pipeline
	if len(reg.Names()) > 0 {
		pipeline = compose.New(reg)
		pipeline.SetRatingsCacheTTL(cfg.RatingsCacheTTL)
		// Lets the genre badge tell anime apart from animation generally. The
		// mapper answers from an in-memory index, so this costs no request time.
		pipeline.SetAnimeResolver(animeMapper)
		if tmdb, ok := reg.Get("tmdb").(*provider.TMDB); ok && tmdb != nil {
			pipeline.SetTrendingResolver(provider.NewTrendingIndex(tmdb, provider.TrendingOptions{
				Window: cfg.TrendingWindow,
				Depth:  cfg.TrendingDepth,
			}))
		}
		// Keeps the last good answer per source, so a source that breaks or gets
		// throttled falls back instead of quietly dropping its badge.
		pipeline.SetHealthTracker(provider.NewHealthTracker(0, 0))
		// Lets a quality badge stand for a release that exists rather than a
		// label that was picked.
		if cfg.StreamAddonURL != "" {
			sq := provider.NewStreamQuality(cfg.StreamAddonURL, cfg.StreamTimeout)
			pipeline.SetQualityDetector(sq, cfg.StreamCacheTTL)
			logger.Info("Quality badges will be checked against a stream addon",
				"addon", logging.RedactURL(sq.BaseURL()),
				"timeout", cfg.StreamTimeout, "cache_ttl", cfg.StreamCacheTTL)
		}
	}

	renderCache, err := cache.New(cfg.CacheDir, cfg.CacheTTL, cfg.CacheMaxEntries, cfg.CacheMaxBytes)
	if err != nil {
		logger.Error("Failed to open the render cache", "error", err)
		os.Exit(1)
	}
	defer renderCache.Close()

	logger.Info("Starting XRDB",
		"version", cfg.Version,
		"addr", cfg.Address,
		"log_level", cfg.LogLevel,
		"render_concurrency", cfg.RenderConcurrency,
		"memory_limit_mb", cfg.MemoryLimitBytes>>20,
		"cache_max_entries", cfg.CacheMaxEntries,
		"cache_max_mb", cfg.CacheMaxBytes>>20,
		"providers", reg.Names(),
		"imdb_dataset", cfg.IMDbDatasetDir != "",
		"imdb_top_rated", cfg.IMDbTopRated,
	)

	handler := server.NewHandler(cfg.Version, store, settingsStore, pipeline, renderCache, cfg, ui.FS())

	// Re-render library artwork on a schedule, so a profile edit reaches the
	// files on disk without anyone triggering it. No-ops unless the folder
	// writer is enabled and an interval is set.
	scheduleCtx, stopSchedule := context.WithCancel(context.Background())
	defer stopSchedule()
	server.StartFolderWriterSchedule(scheduleCtx, cfg, pipeline, store, logger)

	srv := &http.Server{
		Addr:              cfg.Address,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	go func() {
		logger.Info("HTTP server listening", "addr", cfg.Address)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP server stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	logger.Info("Shutting down")
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Graceful shutdown failed", "error", err)
	}
}

// logProviderReadiness reports which providers hold credentials. Keyless
// providers are always ready.
func logProviderReadiness(reg *provider.Registry) {
	var ready, waiting []string
	for _, name := range reg.Names() {
		p := reg.Get(name)
		if p == nil {
			continue
		}
		hc, keyed := p.(interface{ HasCredentials() bool })
		switch {
		case !keyed:
			ready = append(ready, name)
		case hc.HasCredentials():
			ready = append(ready, name)
		default:
			waiting = append(waiting, name)
		}
	}
	slog.Info("Registered the rating providers",
		"ready", strings.Join(ready, ","),
		"waiting_for_a_key", strings.Join(waiting, ","))
	if len(waiting) > 0 {
		slog.Warn("Some providers have no credentials, so the sources they serve will not appear",
			"providers", strings.Join(waiting, ","))
	}
}
