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

// credential returns the first name that is set. v2 read several of these
// without the XRDB_ prefix.
func credential(names ...string) string {
	for _, name := range names {
		if v := strings.TrimSpace(os.Getenv(name)); v != "" {
			return v
		}
	}
	return ""
}

// CacheWarm describes the scheduled pre-render of an addon's catalogues, so a
// catalogue that is browsed often is served from cache rather than rendered on
// first sight. Each surface names its own addon; an empty URL warms nothing for
// that surface.
type CacheWarm struct {
	Enabled      bool
	PostersURL   string
	BackdropsURL string
	LogosURL     string
	// MaxItems caps how many titles are taken from one addon per surface.
	MaxItems int
	// Interval is how often the run repeats. The first run is at startup.
	Interval time.Duration
}

// cacheWarmFromEnv reads the warm schedule. Everything is off unless
// XRDB_CACHE_WARM_ENABLED says otherwise, so an instance nobody configured
// spends nothing on it.
func cacheWarmFromEnv() CacheWarm {
	w := CacheWarm{
		Enabled:      envTruthy("XRDB_CACHE_WARM_ENABLED"),
		PostersURL:   os.Getenv("XRDB_CACHE_WARM_POSTERS_URL"),
		BackdropsURL: os.Getenv("XRDB_CACHE_WARM_BACKDROPS_URL"),
		LogosURL:     os.Getenv("XRDB_CACHE_WARM_LOGOS_URL"),
		MaxItems:     200,
		Interval:     24 * time.Hour,
	}
	if raw := os.Getenv("XRDB_CACHE_WARM_MAX_ITEMS"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			w.MaxItems = n
		}
	}
	if raw := os.Getenv("XRDB_CACHE_WARM_INTERVAL_HOURS"); raw != "" {
		if h, err := strconv.ParseFloat(raw, 64); err == nil && h > 0 {
			w.Interval = time.Duration(h * float64(time.Hour))
		}
	}
	return w
}

func envTruthy(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// Surfaces returns the addon URL for each surface that has one.
func (w CacheWarm) Surfaces() map[string]string {
	out := make(map[string]string, 3)
	for surface, url := range map[string]string{
		"poster": w.PostersURL, "backdrop": w.BackdropsURL, "logo": w.LogosURL,
	} {
		if strings.TrimSpace(url) != "" {
			out[surface] = url
		}
	}
	return out
}

type Config struct {
	// CacheWarm pre-renders an addon's catalogues on a schedule.
	CacheWarm CacheWarm
	Address   string
	Version   string
	DBPath    string
	CacheDir  string
	CacheTTL  time.Duration
	// RPDBMaxSize caps the output size on the RPDB compatibility route. Stremio
	// caps a meta poster at 100KB, and a 4K one is ten times that, so the route
	// caps what the profile behind it asked for. Empty caps nothing.
	RPDBMaxSize string

	// NotFoundTTL is how long a render that produced no artwork is remembered,
	// so a burst over one title does not repeat the full provider sweep per
	// request. Zero disables it.
	NotFoundTTL time.Duration

	// DegradedCacheTTL caps how long a render that lost a badge to a failing
	// source is cached.
	DegradedCacheTTL time.Duration
	// HeldOutCacheTTL caps a render whose only missing badge was held back by
	// one of our own gates — a quota reserve or a pacing queue. Nothing failed,
	// so the render is stored and served normally, for less than the full TTL.
	HeldOutCacheTTL time.Duration
	// QueueHeldCacheTTL caps a render held back by one of our request queues.
	// A queue clears in seconds where the daily reserve stands for hours, so it
	// is held for much less than HeldOutCacheTTL.
	QueueHeldCacheTTL time.Duration
	RatingsCacheTTL   time.Duration
	// StreamAddonURL is a Stremio stream addon (Comet, Torrentio) asked which
	// release qualities a title has, so a quality badge stands for something
	// that exists rather than a label someone ticked. Defaults to a public
	// Comet instance so this holds on an instance nobody configured; "off"
	// disables the check and draws the picks as they are.
	// A URL carrying a debrid token narrows the answer to that account, so it
	// is treated as a secret and never logged past its host.
	StreamAddonURL string
	// StreamTimeout bounds the addon call itself. An addon that has to go and
	// scrape takes tens of seconds, so this is sized to let the answer arrive
	// and be remembered, not to a render waiting for it.
	StreamTimeout time.Duration
	// RenderTimingSample reports one render in n phase breakdowns at info, so a
	// live instance can be asked where its time goes without debug's volume.
	RenderTimingSample int
	// StreamBudget is how long a render waits for that call before drawing the
	// picked badges unverified. Sized to an addon answering from its own cache;
	// the call carries on without the render and warms the next one.
	StreamBudget time.Duration
	// StreamCacheTTL is how long a title's detected qualities stand. Availability
	// moves far more slowly than a render config changes.
	StreamCacheTTL  time.Duration
	CacheMaxEntries int   // hot tier entry cap
	CacheMaxBytes   int64 // hot tier byte cap
	// Disk tier caps. The disk tier is what a catalogue re-read hits, so a small
	// one means re-rendering titles that were rendered hours ago. 0 = default.
	CacheDiskMaxFiles int
	CacheDiskMaxBytes int64
	TMDBAPIKey        string
	TMDBReadToken     string
	MDBListAPIKey     string
	MediuxAPIKey      string
	OMDBAPIKey        string
	FanartAPIKey      string
	TraktClientID     string
	SIMKLClientID     string
	IMDbDatasetDir    string // directory for cached IMDb dataset file; empty = disabled
	// IMDbTopRated enables the locally computed top-rated film ranking. It is
	// separate from IMDbDatasetDir because building it streams a second, much
	// larger dataset on each refresh.
	IMDbTopRated        bool
	TrendingWindow      string // TMDB trending period: day|week
	TrendingDepth       int    // how many trending titles earn the badge
	JikanURL            string // override Jikan API base URL; empty = a donated public instance
	AnimeMapURL         string // override anime ID mapping dataset URL; empty = default
	AnimeMapFallbackURL string // live anime mapping API base URL; "off" disables
	// AnimeMapSupplementURL is the secondary anime mapping dataset (nattadasu);
	// "" uses the built-in default, "off" disables it.
	AnimeMapSupplementURL string
	IMDbRefresh           time.Duration            // IMDb dataset rebuild interval while running
	AnimeMapRefresh       time.Duration            // anime mapping dataset refresh interval; 0 = default (7 days)
	ProviderTTLs          map[string]time.Duration // per-provider TTL overrides; key = provider name
	AdminKey              string                   // protects /api/admin/* routes
	// ConfigEncryptionKey encrypts owner-supplied provider credentials at rest.
	// Unset means the server will not accept them.
	ConfigEncryptionKey string
	APIKey              string // if set, required on all render routes
	RenderConcurrency   int    // max simultaneous renders; caps memory under bursts
	// RenderCapPerMinute bounds how many fresh renders one caller may ask for
	// each minute. Zero disables the cap.
	RenderCapPerMinute int
	// SharedProfileAliases names profiles several unrelated people use, which
	// are capped by address instead: a limit on the profile would hit a crowd.
	SharedProfileAliases []string

	// RenderQueueWait bounds how long a render waits for a slot before the
	// request is shed. Zero waits forever, which is what produced 144s renders.
	RenderQueueWait time.Duration
	// RenderQueueWaitBulk is the same bound for a caller sweeping the catalogue.
	// Nobody is watching a sweep, so it waits rather than being turned away, and
	// it stands aside while interactive requests are queued.
	RenderQueueWaitBulk time.Duration
	// RenderQueueWaitBurst is the bound for a caller drawing on its burst
	// allowance. It is short: such a caller is refused rather than held a slot
	// for, since the cap is already turning some of its requests away.
	RenderQueueWaitBurst time.Duration
	// ArtFetchTimeout bounds the source-artwork HTTP fetch. A stalled fetch
	// otherwise holds a render slot doing nothing until it elapses, starving
	// the renders queued behind it.
	ArtFetchTimeout  time.Duration
	MemoryLimitBytes int64  // soft heap limit (debug.SetMemoryLimit); 0 = unset
	LogLevel         string // debug|info|warn|error (default info)
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

// DefaultStreamAddonURL is asked which qualities a title is available in when
// no addon is configured. It is a public Comet instance: Comet aggregates
// Torrentio and its own sources, and the check drops a badge it cannot find, so
// a thinner source does not just miss detail, it removes badges that are true.
const DefaultStreamAddonURL = "https://comet.stremio.ru"

// streamAddonURL resolves the addon to ask. Unset takes the default so the
// check holds on an instance nobody configured; "off" turns it off for an
// operator who would rather not call out at all.
func streamAddonURL() string {
	raw := strings.TrimSpace(os.Getenv("XRDB_STREAM_ADDON_URL"))
	switch strings.ToLower(raw) {
	case "":
		return DefaultStreamAddonURL
	case "off", "none", "disabled", "false":
		return ""
	}
	return raw
}

func Load() Config {
	trendingDepth := 100
	if raw := os.Getenv("XRDB_TRENDING_DEPTH"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			trendingDepth = n
		}
	}
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
	// A render missing a badge because its source errored is held only briefly,
	// so it re-renders soon after the source recovers instead of carrying the
	// gap for the full cache TTL. Zero falls back to the normal TTL.
	degradedCacheTTL := 20 * time.Minute
	if raw := os.Getenv("XRDB_DEGRADED_CACHE_TTL_MINUTES"); raw != "" {
		if d, err := time.ParseDuration(raw + "m"); err == nil && d >= 0 {
			degradedCacheTTL = d
		}
	}
	if degradedCacheTTL > cacheTTL {
		degradedCacheTTL = cacheTTL
	}
	// A render that lost a badge to our own pacing is complete apart from a
	// piece nobody asked for, so it is cached rather than recomputed on every
	// request. Shorter than the full TTL: the gate it hit usually clears well
	// inside the window.
	heldOutCacheTTL := 3 * time.Hour
	if raw := os.Getenv("XRDB_HELD_OUT_CACHE_TTL_HOURS"); raw != "" {
		if d, err := time.ParseDuration(raw + "h"); err == nil && d >= 0 {
			heldOutCacheTTL = d
		}
	}
	if heldOutCacheTTL > cacheTTL {
		heldOutCacheTTL = cacheTTL
	}
	// A pacing or budget queue clears in seconds, so a render it held back is
	// worth keeping only long enough to spare the repeat work.
	queueHeldCacheTTL := 15 * time.Minute
	if raw := os.Getenv("XRDB_QUEUE_HELD_CACHE_TTL_MINUTES"); raw != "" {
		if d, err := time.ParseDuration(raw + "m"); err == nil && d >= 0 {
			queueHeldCacheTTL = d
		}
	}
	if queueHeldCacheTTL > cacheTTL {
		queueHeldCacheTTL = cacheTTL
	}
	rpdbMaxSize := "small"
	if raw := os.Getenv("XRDB_RPDB_MAX_SIZE"); raw != "" {
		rpdbMaxSize = strings.ToLower(strings.TrimSpace(raw))
	}
	// Short by design: it collapses a burst without outliving the outage behind
	// it, so artwork appearing upstream is still picked up within the minute.
	notFoundTTL := 60 * time.Second
	if raw := os.Getenv("XRDB_NOT_FOUND_TTL_SECONDS"); raw != "" {
		if d, err := time.ParseDuration(raw + "s"); err == nil && d >= 0 {
			notFoundTTL = d
		}
	}
	// A title's available qualities move slowly, so they are held far longer
	// than a rating and well past the render that first asked for them.
	streamCacheTTL := 24 * time.Hour
	if raw := os.Getenv("XRDB_STREAM_CACHE_TTL_HOURS"); raw != "" {
		if d, err := time.ParseDuration(raw + "h"); err == nil && d >= 0 {
			streamCacheTTL = d
		}
	}
	// The addon answers alongside the rating sources, so this bounds the wait
	// rather than adding to it. Past this the render goes out without the row.
	streamTimeout := 30 * time.Second
	if raw := os.Getenv("XRDB_STREAM_TIMEOUT_MS"); raw != "" {
		if d, err := time.ParseDuration(raw + "ms"); err == nil && d > 0 {
			streamTimeout = d
		}
	}
	// One render in n reports its phase breakdown at info. Zero or one leaves it
	// at debug, where a live instance never sees it.
	renderTimingSample := 0
	if raw := os.Getenv("XRDB_RENDER_TIMING_SAMPLE"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			renderTimingSample = n
		}
	}

	streamBudget := 300 * time.Millisecond
	if raw := os.Getenv("XRDB_STREAM_BUDGET_MS"); raw != "" {
		if d, err := time.ParseDuration(raw + "ms"); err == nil && d > 0 {
			streamBudget = d
		}
	}
	// A budget at or above the call's own timeout is the behaviour this split
	// exists to remove: the render would wait out the whole call again.
	if streamBudget >= streamTimeout {
		streamBudget = streamTimeout / 10
	}

	// Ratings are per title, so they outlive any one render config, and they
	// barely move day to day. A day's term keeps the paced sources off the render
	// path for titles already seen. Zero disables the cache. The stored shape is
	// versioned, so a MediaMeta change still invalidates regardless of term.
	ratingsCacheTTL := 24 * time.Hour
	if raw := os.Getenv("XRDB_RATINGS_CACHE_TTL_HOURS"); raw != "" {
		if d, err := time.ParseDuration(raw + "h"); err == nil && d >= 0 {
			ratingsCacheTTL = d
		}
	}
	cacheMaxEntries := 300
	if raw := os.Getenv("XRDB_CACHE_MAX_ENTRIES"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			cacheMaxEntries = n
		}
	}
	var cacheDiskMaxFiles int
	if raw := os.Getenv("XRDB_CACHE_DISK_MAX_FILES"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			cacheDiskMaxFiles = n
		}
	}
	var cacheDiskMaxBytes int64
	if raw := os.Getenv("XRDB_CACHE_DISK_MAX_MB"); raw != "" {
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil && n > 0 && n <= math.MaxInt64>>20 {
			cacheDiskMaxBytes = n << 20
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
	// How long a render may sit waiting for a slot before it is turned away. A
	// burst that outruns throughput otherwise queues without bound, and the queue
	// is what turns a short burst into minutes of latency for everyone behind it.
	// 0 restores the old unbounded wait.
	// A crawler walking a catalogue arrives faster than the renderer can serve,
	// and the queue it builds is paid for by everyone behind it. 30 clears the
	// busiest real user measured, so the cap lands on the crawl rather than on
	// somebody scrolling a large library.
	//
	// Off by default. On a self-hosted instance the owner is the only caller, so
	// a cap protects them from themselves — it turned a large library into 429s
	// for the person who owns the box. A shared instance sets this in its own
	// environment.
	renderCapPerMinute := 0
	if raw := os.Getenv("XRDB_RENDER_CAP_PER_MINUTE"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 0 {
			renderCapPerMinute = n
		}
	}
	sharedProfileAliases := []string{"aios", "cimofam"}
	if raw := os.Getenv("XRDB_SHARED_PROFILE_ALIASES"); raw != "" {
		sharedProfileAliases = nil
		for _, a := range strings.Split(raw, ",") {
			if a = strings.ToLower(strings.TrimSpace(a)); a != "" {
				sharedProfileAliases = append(sharedProfileAliases, a)
			}
		}
	}
	// A sweep has nobody waiting on it, so it is made to wait rather than shed.
	renderQueueWaitBulk := 60 * time.Second
	if raw := os.Getenv("XRDB_RENDER_QUEUE_WAIT_BULK_SECONDS"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			renderQueueWaitBulk = time.Duration(n) * time.Second
		}
	}

	renderQueueWait := 8 * time.Second
	if raw := os.Getenv("XRDB_RENDER_QUEUE_WAIT_SECONDS"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 0 {
			renderQueueWait = time.Duration(n) * time.Second
		}
	}
	// A caller into its burst allowance is refused quickly rather than holding a
	// slot: it still gets one whenever the queue is short, which is the common
	// case, and stops occupying capacity when it is not.
	renderQueueWaitBurst := time.Second
	if raw := os.Getenv("XRDB_RENDER_QUEUE_WAIT_BURST_SECONDS"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			renderQueueWaitBurst = time.Duration(n) * time.Second
		}
	}
	// Bounds the source-artwork fetch. A normal fetch runs around a second, so
	// this is generous while still failing fast: a stalled fetch that ran the
	// old 15s default held a render slot idle, which deepened the queue for
	// every render behind it under load.
	artFetchTimeout := 5 * time.Second
	if raw := os.Getenv("XRDB_ART_FETCH_TIMEOUT_SECONDS"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			artFetchTimeout = time.Duration(n) * time.Second
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
	// Matches the weekly age check the dataset was written with. Zero turns the
	// background rebuild off and leaves the index as it was at startup.
	imdbRefresh := 7 * 24 * time.Hour
	if raw := os.Getenv("XRDB_IMDB_REFRESH_HOURS"); raw != "" {
		if h, err := strconv.ParseFloat(raw, 64); err == nil && h >= 0 {
			imdbRefresh = time.Duration(h * float64(time.Hour))
		}
	}
	return Config{
		CacheWarm:             cacheWarmFromEnv(),
		Address:               addr,
		Version:               version,
		DBPath:                dbPath,
		CacheDir:              cacheDir,
		RatingsCacheTTL:       ratingsCacheTTL,
		StreamAddonURL:        streamAddonURL(),
		StreamTimeout:         streamTimeout,
		StreamBudget:          streamBudget,
		RenderTimingSample:    renderTimingSample,
		StreamCacheTTL:        streamCacheTTL,
		CacheTTL:              cacheTTL,
		DegradedCacheTTL:      degradedCacheTTL,
		HeldOutCacheTTL:       heldOutCacheTTL,
		QueueHeldCacheTTL:     queueHeldCacheTTL,
		NotFoundTTL:           notFoundTTL,
		RPDBMaxSize:           rpdbMaxSize,
		CacheMaxEntries:       cacheMaxEntries,
		CacheDiskMaxFiles:     cacheDiskMaxFiles,
		CacheDiskMaxBytes:     cacheDiskMaxBytes,
		CacheMaxBytes:         cacheMaxBytes,
		TMDBAPIKey:            credential("XRDB_TMDB_API_KEY", "TMDB_API_KEY"),
		TMDBReadToken:         credential("XRDB_TMDB_READ_TOKEN", "TMDB_READ_TOKEN"),
		MDBListAPIKey:         credential("XRDB_MDBLIST_API_KEY", "MDBLIST_API_KEY"),
		MediuxAPIKey:          credential("XRDB_MEDIUX_API_KEY", "MEDIUX_API_KEY"),
		OMDBAPIKey:            credential("XRDB_OMDB_API_KEY", "OMDB_API_KEY", "OMDB_KEY"),
		FanartAPIKey:          credential("XRDB_FANART_API_KEY", "FANART_API_KEY"),
		TraktClientID:         credential("XRDB_TRAKT_CLIENT_ID", "TRAKT_CLIENT_ID"),
		SIMKLClientID:         credential("XRDB_SIMKL_CLIENT_ID", "SIMKL_CLIENT_ID"),
		IMDbDatasetDir:        os.Getenv("XRDB_IMDB_DATASET_DIR"),
		IMDbTopRated:          boolEnv("XRDB_IMDB_TOP_RATED"),
		TrendingWindow:        os.Getenv("XRDB_TRENDING_WINDOW"),
		TrendingDepth:         trendingDepth,
		JikanURL:              os.Getenv("XRDB_JIKAN_URL"),
		AnimeMapURL:           os.Getenv("XRDB_ANIME_MAP_URL"),
		AnimeMapFallbackURL:   os.Getenv("XRDB_ANIME_MAP_FALLBACK_URL"),
		AnimeMapSupplementURL: os.Getenv("XRDB_ANIME_MAP_SUPPLEMENT_URL"),
		AnimeMapRefresh:       animeMapRefresh,
		IMDbRefresh:           imdbRefresh,
		ProviderTTLs:          loadProviderTTLs(cacheTTL),
		AdminKey:              os.Getenv("XRDB_ADMIN_KEY"),
		APIKey:                os.Getenv("XRDB_API_KEY"),
		ConfigEncryptionKey:   os.Getenv("XRDB_CONFIG_ENCRYPTION_KEY"),
		RenderConcurrency:     renderConcurrency,
		RenderQueueWait:       renderQueueWait,
		RenderQueueWaitBulk:   renderQueueWaitBulk,
		RenderQueueWaitBurst:  renderQueueWaitBurst,
		RenderCapPerMinute:    renderCapPerMinute,
		SharedProfileAliases:  sharedProfileAliases,
		ArtFetchTimeout:       artFetchTimeout,
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
