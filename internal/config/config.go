package config

import (
	"math"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// DefaultLogLevel is the verbosity used when neither XRDB_LOG_LEVEL nor a
// stored override is set. Exported so the admin revert path can fall back to
// the same value the loader would pick.
const DefaultLogLevel = "info"

type Config struct {
	Address         string
	Version         string
	DBPath          string
	CacheDir        string
	CacheTTL        time.Duration
	CacheMaxEntries int   // hot tier entry cap
	CacheMaxBytes   int64 // hot tier byte cap
	TMDBAPIKey      string
	TMDBReadToken   string
	MDBListAPIKey   string
	OMDBAPIKey      string
	FanartAPIKey    string
	TraktClientID   string
	SIMKLClientID   string
	IMDbDatasetDir  string // directory for cached IMDb dataset file; empty = disabled
	// IMDbTopRated enables the locally computed top-rated film ranking. It is
	// separate from IMDbDatasetDir because building it streams a second, much
	// larger dataset on each refresh.
	IMDbTopRated        bool
	JikanURL            string // override Jikan API base URL; empty = public api.jikan.moe
	AnimeMapURL         string // override anime ID mapping dataset URL; empty = default
	AnimeMapFallbackURL string // live anime mapping API base URL; "off" disables
	// AnimeMapSupplementURL is the secondary anime mapping dataset (nattadasu);
	// "" uses the built-in default, "off" disables it.
	AnimeMapSupplementURL string
	AnimeMapRefresh       time.Duration            // anime mapping dataset refresh interval; 0 = default (7 days)
	ProviderTTLs          map[string]time.Duration // per-provider TTL overrides; key = provider name
	AdminKey              string                   // protects /api/admin/* routes
	// ConfigEncryptionKey encrypts owner-supplied provider credentials at rest.
	// Unset means the server will not accept them.
	ConfigEncryptionKey string
	APIKey                string                   // if set, required on all render routes
	RenderConcurrency     int                      // max simultaneous renders; caps memory under bursts
	MemoryLimitBytes      int64                    // soft heap limit (debug.SetMemoryLimit); 0 = unset
	LogLevel              string                   // debug|info|warn|error (default info)
	// TrustedProxies is a comma-separated list of CIDRs or addresses whose
	// X-Forwarded-* and CF-Connecting-IP headers may be believed. Empty means
	// loopback plus the private ranges, which covers the usual reverse-proxy
	// topology without letting a public client claim someone else's address.
	TrustedProxies string
	// TrustProxyHeaders believes forwarded headers from any peer. Needed when
	// the proxy address is not predictable, and opt-in because it makes the
	// client address spoofable.
	TrustProxyHeaders bool
	// FolderWriter writes rendered artwork into the media library. Off by
	// default and deliberately so: it is the only feature that modifies a
	// user's files, and leaving it off keeps that guarantee intact.
	FolderWriter bool
	// LibraryRoots are the directories the folder writer walks.
	LibraryRoots []string
	// FolderWriterSurfaces limits which artwork is written; empty means poster
	// and backdrop.
	FolderWriterSurfaces []string
	// FolderWriterProfile is the profile id or alias whose look library
	// artwork takes; empty uses the defaults.
	FolderWriterProfile string
	// FolderWriterOverwrite replaces artwork already present. Off by default so
	// a curated poster is not silently replaced.
	FolderWriterOverwrite bool
	// FolderWriterPace is the delay between titles, so a first pass over a
	// large library does not saturate the rating sources.
	FolderWriterPace time.Duration
	// FolderWriterInterval re-runs the pass on a schedule; 0 disables it.
	FolderWriterInterval time.Duration
}

// loadProviderTTLs builds the per-provider TTL map.
// Each provider can be overridden via XRDB_TTL_<PROVIDER> (in hours, float).
// Example: XRDB_TTL_MDBLIST=4 sets a 4-hour TTL for mdblist ratings.
// Unset providers inherit the global defaultTTL.
// TTLProviders lists the providers whose cache TTL can be tuned. Exported so the
// admin API offers the same set the loader knows about.
var TTLProviders = []string{
	"tmdb", "mdblist", "omdb", "fanart",
	"trakt", "simkl", "mal", "anilist", "kitsu", "imdb_local",
	"allocine", "filmweb",
}

// ProviderTTLEnvVar returns the environment variable that overrides a provider's
// cache TTL, e.g. "tmdb" -> "XRDB_TTL_TMDB", "imdb_local" -> "XRDB_TTL_IMDBLOCAL".
func ProviderTTLEnvVar(name string) string {
	return "XRDB_TTL_" + strings.ToUpper(strings.ReplaceAll(name, "_", ""))
}

// ProviderEnvTTL returns a provider's TTL from its environment variable, or
// defaultTTL when unset or invalid. This is the value a runtime override reverts
// to when cleared, so it must match what the loader would pick.
func ProviderEnvTTL(name string, defaultTTL time.Duration) time.Duration {
	if raw := os.Getenv(ProviderTTLEnvVar(name)); raw != "" {
		if h, err := strconv.ParseFloat(raw, 64); err == nil && h > 0 {
			return time.Duration(h * float64(time.Hour))
		}
	}
	return defaultTTL
}

func loadProviderTTLs(defaultTTL time.Duration) map[string]time.Duration {
	ttls := make(map[string]time.Duration, len(TTLProviders))
	for _, name := range TTLProviders {
		ttls[name] = ProviderEnvTTL(name, defaultTTL)
	}
	return ttls
}

// buildVersion is stamped into the binary at link time (-X). Empty for a plain
// `go build`, which is what makes the environment fallback below useful.
var buildVersion string

// resolveVersion reports the build this binary came from.
//
// The stamped value wins over the environment because it travels with the
// binary and nothing downstream can desynchronise it. An environment variable
// can: a container runtime that recreates a container on a new image while
// carrying the previous container's environment forward will pin the old value
// indefinitely, leaving a current build reporting a stale version.
func resolveVersion() string {
	if buildVersion != "" {
		return buildVersion
	}
	if v := os.Getenv("XRDB_VERSION"); v != "" {
		return v
	}
	return "dev"
}

func Load() Config {
	addr := os.Getenv("XRDB_ADDR")
	if addr == "" {
		addr = ":8787"
	}
	version := resolveVersion()
	logLevel := os.Getenv("XRDB_LOG_LEVEL")
	if logLevel == "" {
		logLevel = DefaultLogLevel
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
	cacheMaxEntries := 300
	if raw := os.Getenv("XRDB_CACHE_MAX_ENTRIES"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			cacheMaxEntries = n
		}
	}
	var cacheMaxBytes int64 = 256 << 20
	if raw := os.Getenv("XRDB_CACHE_MAX_MB"); raw != "" {
		// Bound before shifting: values above MaxInt64>>20 MiB would overflow
		// the byte conversion and wrap the cap negative.
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil && n > 0 && n <= math.MaxInt64>>20 {
			cacheMaxBytes = n << 20
		}
	}
	// Cap concurrent renders so a burst of catalogue requests can't spawn
	// unbounded image composites and exhaust memory. Scales with CPUs; override
	// with XRDB_RENDER_CONCURRENCY.
	renderConcurrency := 2 * runtime.NumCPU()
	if renderConcurrency < 4 {
		renderConcurrency = 4
	}
	if raw := os.Getenv("XRDB_RENDER_CONCURRENCY"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			renderConcurrency = n
		}
	}
	// Optional soft heap limit so the Go runtime GCs harder before the container
	// cgroup cap triggers a kernel OOM-kill. Set to roughly the container limit.
	var memoryLimitBytes int64
	if raw := os.Getenv("XRDB_MEMORY_LIMIT_MB"); raw != "" {
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil && n > 0 && n <= math.MaxInt64>>20 {
			memoryLimitBytes = n << 20
		}
	}
	var animeMapRefresh time.Duration
	if raw := os.Getenv("XRDB_ANIME_MAP_REFRESH_HOURS"); raw != "" {
		if h, err := strconv.ParseFloat(raw, 64); err == nil && h > 0 {
			animeMapRefresh = time.Duration(h * float64(time.Hour))
		}
	}
	return Config{
		Address:               addr,
		Version:               version,
		DBPath:                dbPath,
		CacheDir:              cacheDir,
		CacheTTL:              cacheTTL,
		CacheMaxEntries:       cacheMaxEntries,
		CacheMaxBytes:         cacheMaxBytes,
		TMDBAPIKey:            os.Getenv("XRDB_TMDB_API_KEY"),
		TMDBReadToken:         os.Getenv("XRDB_TMDB_READ_TOKEN"),
		MDBListAPIKey:         os.Getenv("XRDB_MDBLIST_API_KEY"),
		OMDBAPIKey:            os.Getenv("XRDB_OMDB_API_KEY"),
		FanartAPIKey:          os.Getenv("XRDB_FANART_API_KEY"),
		TraktClientID:         os.Getenv("XRDB_TRAKT_CLIENT_ID"),
		SIMKLClientID:         os.Getenv("XRDB_SIMKL_CLIENT_ID"),
		IMDbDatasetDir:        os.Getenv("XRDB_IMDB_DATASET_DIR"),
		IMDbTopRated:          boolEnv("XRDB_IMDB_TOP_RATED"),
		JikanURL:              os.Getenv("XRDB_JIKAN_URL"),
		AnimeMapURL:           os.Getenv("XRDB_ANIME_MAP_URL"),
		AnimeMapFallbackURL:   os.Getenv("XRDB_ANIME_MAP_FALLBACK_URL"),
		AnimeMapSupplementURL: os.Getenv("XRDB_ANIME_MAP_SUPPLEMENT_URL"),
		AnimeMapRefresh:       animeMapRefresh,
		ProviderTTLs:          loadProviderTTLs(cacheTTL),
		AdminKey:              os.Getenv("XRDB_ADMIN_KEY"),
		APIKey:                os.Getenv("XRDB_API_KEY"),
		ConfigEncryptionKey:   os.Getenv("XRDB_CONFIG_ENCRYPTION_KEY"),
		RenderConcurrency:     renderConcurrency,
		MemoryLimitBytes:      memoryLimitBytes,
		LogLevel:              logLevel,
		TrustedProxies:        os.Getenv("XRDB_TRUSTED_PROXIES"),
		TrustProxyHeaders:     boolEnv("XRDB_TRUST_PROXY_HEADERS"),
		FolderWriter:          boolEnv("XRDB_FOLDER_WRITER"),
		LibraryRoots:          listEnv("XRDB_LIBRARY_ROOTS"),
		FolderWriterSurfaces:  listEnv("XRDB_FOLDER_WRITER_SURFACES"),
		FolderWriterProfile:   os.Getenv("XRDB_FOLDER_WRITER_PROFILE"),
		FolderWriterOverwrite: boolEnv("XRDB_FOLDER_WRITER_OVERWRITE"),
		FolderWriterPace:      durationEnv("XRDB_FOLDER_WRITER_PACE_MS", time.Millisecond, 250*time.Millisecond),
		FolderWriterInterval:  durationEnv("XRDB_FOLDER_WRITER_INTERVAL_H", time.Hour, 0),
	}
}

// boolEnv reads a boolean environment variable, accepting the spellings people
// actually write in a compose file. Anything unrecognised is false.
func boolEnv(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// listEnv reads a comma-separated environment variable into a trimmed slice.
func listEnv(name string) []string {
	var out []string
	for _, part := range strings.Split(os.Getenv(name), ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// durationEnv reads a numeric environment variable in the given unit. An unset
// or unparseable value takes the fallback, so a typo does not turn a paced
// scan into an unpaced one.
func durationEnv(name string, unit time.Duration, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	n, err := strconv.ParseFloat(raw, 64)
	if err != nil || n < 0 {
		return fallback
	}
	return time.Duration(n * float64(unit))
}
