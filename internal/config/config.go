package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address             string
	Version             string
	DBPath              string
	CacheDir            string
	CacheTTL            time.Duration
	TMDBAPIKey          string
	TMDBReadToken       string
	MDBListAPIKey       string
	OMDBAPIKey          string
	FanartAPIKey        string
	TraktClientID       string
	SIMKLClientID       string
	IMDbDatasetDir      string                   // directory for cached IMDb dataset file; empty = disabled
	AnimeMapURL         string                   // override anime ID mapping dataset URL; empty = default
	AnimeMapFallbackURL string                   // live anime mapping API base URL; "off" disables
	AnimeMapRefresh     time.Duration            // anime mapping dataset refresh interval; 0 = default (7 days)
	ProviderTTLs        map[string]time.Duration // per-provider TTL overrides; key = provider name
	AdminKey            string                   // protects /api/admin/* routes
	APIKey              string                   // if set, required on all render routes
}

// loadProviderTTLs builds the per-provider TTL map.
// Each provider can be overridden via XRDB_TTL_<PROVIDER> (in hours, float).
// Example: XRDB_TTL_MDBLIST=4 sets a 4-hour TTL for mdblist ratings.
// Unset providers inherit the global defaultTTL.
func loadProviderTTLs(defaultTTL time.Duration) map[string]time.Duration {
	providers := []string{
		"tmdb", "mdblist", "omdb", "fanart",
		"trakt", "simkl", "mal", "anilist", "kitsu", "imdb_local",
	}
	ttls := make(map[string]time.Duration, len(providers))
	for _, name := range providers {
		key := "XRDB_TTL_" + strings.ToUpper(strings.ReplaceAll(name, "_", ""))
		if raw := os.Getenv(key); raw != "" {
			if h, err := strconv.ParseFloat(raw, 64); err == nil && h > 0 {
				ttls[name] = time.Duration(h * float64(time.Hour))
				continue
			}
		}
		ttls[name] = defaultTTL
	}
	return ttls
}

func Load() Config {
	addr := os.Getenv("XRDB_ADDR")
	if addr == "" {
		addr = ":8787"
	}
	version := os.Getenv("XRDB_VERSION")
	if version == "" {
		version = "dev"
	}
	dbPath := os.Getenv("XRDB_DB")
	if dbPath == "" {
		dbPath = "xrdb.db"
	}
	cacheDir := os.Getenv("XRDB_CACHE_DIR")
	if cacheDir == "" {
		cacheDir = "xrdb-cache"
	}
	cacheTTL := 72 * time.Hour
	if raw := os.Getenv("XRDB_CACHE_TTL_HOURS"); raw != "" {
		if d, err := time.ParseDuration(raw + "h"); err == nil && d > 0 {
			cacheTTL = d
		}
	}
	var animeMapRefresh time.Duration
	if raw := os.Getenv("XRDB_ANIME_MAP_REFRESH_HOURS"); raw != "" {
		if h, err := strconv.ParseFloat(raw, 64); err == nil && h > 0 {
			animeMapRefresh = time.Duration(h * float64(time.Hour))
		}
	}
	return Config{
		Address:             addr,
		Version:             version,
		DBPath:              dbPath,
		CacheDir:            cacheDir,
		CacheTTL:            cacheTTL,
		TMDBAPIKey:          os.Getenv("XRDB_TMDB_API_KEY"),
		TMDBReadToken:       os.Getenv("XRDB_TMDB_READ_TOKEN"),
		MDBListAPIKey:       os.Getenv("XRDB_MDBLIST_API_KEY"),
		OMDBAPIKey:          os.Getenv("XRDB_OMDB_API_KEY"),
		FanartAPIKey:        os.Getenv("XRDB_FANART_API_KEY"),
		TraktClientID:       os.Getenv("XRDB_TRAKT_CLIENT_ID"),
		SIMKLClientID:       os.Getenv("XRDB_SIMKL_CLIENT_ID"),
		IMDbDatasetDir:      os.Getenv("XRDB_IMDB_DATASET_DIR"),
		AnimeMapURL:         os.Getenv("XRDB_ANIME_MAP_URL"),
		AnimeMapFallbackURL: os.Getenv("XRDB_ANIME_MAP_FALLBACK_URL"),
		AnimeMapRefresh:     animeMapRefresh,
		ProviderTTLs:        loadProviderTTLs(cacheTTL),
		AdminKey:            os.Getenv("XRDB_ADMIN_KEY"),
		APIKey:              os.Getenv("XRDB_API_KEY"),
	}
}
