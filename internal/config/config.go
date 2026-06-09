package config

import (
	"os"
	"time"
)

type Config struct {
	Address       string
	Version       string
	DBPath        string
	CacheDir      string
	CacheTTL      time.Duration
	TMDBAPIKey    string
	TMDBReadToken string
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
		if d, err := time.ParseDuration(raw + "h"); err == nil {
			cacheTTL = d
		}
	}
	return Config{
		Address:       addr,
		Version:       version,
		DBPath:        dbPath,
		CacheDir:      cacheDir,
		CacheTTL:      cacheTTL,
		TMDBAPIKey:    os.Getenv("XRDB_TMDB_API_KEY"),
		TMDBReadToken: os.Getenv("XRDB_TMDB_READ_TOKEN"),
	}
}
