// Package animemap resolves IMDb and TMDB identifiers to anime-service IDs
// (MyAnimeList, AniList, Kitsu).
//
// The primary source is the community-maintained Fribb/anime-lists dataset,
// downloaded once and cached on disk so lookups are local and survive upstream
// outages. Entries missing from the dataset fall back to a live mapping API
// (arm.haglund.dev by default) with per-ID caching, including negative results.
package animemap

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// IDs holds the per-service anime identifiers for one title. A zero value
// means the service has no known ID for the title.
type IDs struct {
	MAL     int
	AniList int
	Kitsu   int
}

func (ids IDs) empty() bool { return ids.MAL == 0 && ids.AniList == 0 && ids.Kitsu == 0 }

const (
	// DefaultDatasetURL is the Fribb/anime-lists "mini" list (~6 MB), which
	// carries every ID XRDB needs (mal/anilist/kitsu/imdb/themoviedb).
	DefaultDatasetURL = "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json"
	// DefaultDatasetMirrorURL is tried when the primary host is unreachable.
	DefaultDatasetMirrorURL = "https://cdn.jsdelivr.net/gh/Fribb/anime-lists@master/anime-list-mini.json"
	// DefaultFallbackURL is the live per-ID mapping API used for titles the
	// dataset doesn't cover yet. Set to "off" in Options to disable.
	DefaultFallbackURL = "https://arm.haglund.dev/api/v2"

	datasetFileName    = "anime-map.json"
	maxDatasetBytes    = 64 * 1024 * 1024
	downloadTimeout    = 60 * time.Second
	retryBackoff       = 5 * time.Minute
	fallbackTimeout    = 8 * time.Second
	fallbackCacheTTL   = 24 * time.Hour
	fallbackCacheLimit = 10000
)

// Options configures a Mapper.
type Options struct {
	CacheDir    string        // directory for the cached dataset file (required)
	DatasetURL  string        // override dataset URL (default Fribb anime-lists)
	MirrorURL   string        // override mirror URL
	FallbackURL string        // live mapping API base URL; "off" disables
	TTL         time.Duration // dataset refresh interval (default 7 days)
	HTTPClient  *http.Client  // override HTTP client (tests)
}

// Mapper resolves media IDs to anime-service IDs using a disk-cached dataset
// with a live API fallback. Safe for concurrent use.
type Mapper struct {
	datasetURL  string
	mirrorURL   string
	fallbackURL string
	path        string
	ttl         time.Duration
	httpClient  *http.Client

	mu          sync.Mutex
	loaded      bool
	loadedAt    time.Time
	lastAttempt time.Time
	refreshing  bool
	byIMDb      map[string]indexed
	byTMDBMovie map[int]indexed
	byTMDBTV    map[int]indexed

	fbMu    sync.Mutex
	fbCache map[string]fallbackEntry
}

// indexed pairs resolved IDs with a season rank so first-season entries win
// when several dataset rows share the same IMDb/TMDB identifier.
type indexed struct {
	ids  IDs
	rank int
}

type fallbackEntry struct {
	ids     IDs
	ok      bool
	expires time.Time
}

// New creates a Mapper. The dataset loads lazily on first Resolve.
func New(opts Options) *Mapper {
	if opts.DatasetURL == "" {
		opts.DatasetURL = DefaultDatasetURL
	}
	if opts.MirrorURL == "" {
		opts.MirrorURL = DefaultDatasetMirrorURL
	}
	if opts.FallbackURL == "" {
		opts.FallbackURL = DefaultFallbackURL
	}
	if strings.EqualFold(opts.FallbackURL, "off") {
		opts.FallbackURL = ""
	}
	if opts.TTL <= 0 {
		opts.TTL = 7 * 24 * time.Hour
	}
	if opts.HTTPClient == nil {
		opts.HTTPClient = &http.Client{Timeout: downloadTimeout}
	}
	return &Mapper{
		datasetURL:  opts.DatasetURL,
		mirrorURL:   opts.MirrorURL,
		fallbackURL: strings.TrimRight(opts.FallbackURL, "/"),
		path:        filepath.Join(opts.CacheDir, datasetFileName),
		ttl:         opts.TTL,
		httpClient:  opts.HTTPClient,
		fbCache:     make(map[string]fallbackEntry),
	}
}

// Resolve maps a media ID (IMDb "tt…" or numeric TMDB) to anime-service IDs.
// mediaType is the render type (poster/backdrop/…) and is only used to break
// the movie/TV ambiguity of bare numeric TMDB IDs, mirroring the TMDB
// provider's heuristic. Returns ok=false when the title isn't a known anime.
func (m *Mapper) Resolve(ctx context.Context, mediaType, id string) (IDs, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return IDs{}, false
	}
	m.ensureLoaded()

	m.mu.Lock()
	ids, ok := m.lookupLocked(mediaType, id)
	m.mu.Unlock()
	if ok {
		return ids, true
	}
	return m.resolveFallback(ctx, id)
}

func (m *Mapper) lookupLocked(mediaType, id string) (IDs, bool) {
	if strings.HasPrefix(id, "tt") {
		if e, ok := m.byIMDb[id]; ok {
			return e.ids, true
		}
		return IDs{}, false
	}
	n, err := strconv.Atoi(id)
	if err != nil {
		return IDs{}, false
	}
	// Bare numeric TMDB IDs are ambiguous between movie and TV; follow the
	// TMDB provider's heuristic (backdrop ⇒ TV first) and try the other space
	// second rather than failing.
	first, second := m.byTMDBMovie, m.byTMDBTV
	if mediaType == "tv" || mediaType == "series" || mediaType == "backdrop" {
		first, second = m.byTMDBTV, m.byTMDBMovie
	}
	if e, ok := first[n]; ok {
		return e.ids, true
	}
	if e, ok := second[n]; ok {
		return e.ids, true
	}
	return IDs{}, false
}

// ensureLoaded loads the disk cache and downloads the dataset when missing or
// stale. A missing dataset downloads synchronously (single-flight, throttled);
// a stale-but-present dataset is served immediately and refreshed in the
// background so render latency never depends on the upstream host.
func (m *Mapper) ensureLoaded() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.loaded {
		if err := m.loadFromDiskLocked(); err == nil {
			m.loaded = true
		}
	}
	stale := !m.loaded || time.Since(m.loadedAt) > m.ttl
	if !stale || m.refreshing || time.Since(m.lastAttempt) < retryBackoff {
		return
	}
	m.lastAttempt = time.Now()
	if m.loaded {
		m.refreshing = true
		go m.refresh()
		return
	}
	// No usable dataset at all: block this first caller on the download so
	// the very first anime render can still succeed.
	m.mu.Unlock()
	err := m.downloadAndStore()
	m.mu.Lock()
	if err == nil {
		if err := m.loadFromDiskLocked(); err == nil {
			m.loaded = true
		}
	}
}

func (m *Mapper) refresh() {
	err := m.downloadAndStore()
	m.mu.Lock()
	defer m.mu.Unlock()
	m.refreshing = false
	if err == nil {
		if err := m.loadFromDiskLocked(); err == nil {
			m.loaded = true
		}
	}
}

func (m *Mapper) loadFromDiskLocked() error {
	info, err := os.Stat(m.path)
	if err != nil {
		return err
	}
	data, err := os.ReadFile(m.path)
	if err != nil {
		return err
	}
	imdb, movie, tv, err := buildIndexes(data)
	if err != nil {
		return err
	}
	m.byIMDb, m.byTMDBMovie, m.byTMDBTV = imdb, movie, tv
	m.loadedAt = info.ModTime()
	return nil
}

func (m *Mapper) downloadAndStore() error {
	data, err := m.fetchDataset(m.datasetURL)
	if err != nil && m.mirrorURL != "" {
		data, err = m.fetchDataset(m.mirrorURL)
	}
	if err != nil {
		return err
	}
	// Validate before persisting so a bad body never replaces a good cache.
	if _, _, _, err := buildIndexes(data); err != nil {
		return fmt.Errorf("animemap: invalid dataset: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return err
	}
	tmp := m.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, m.path)
}

func (m *Mapper) fetchDataset(url string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), downloadTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("animemap: fetch dataset: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("animemap: dataset http %d from %s", resp.StatusCode, url)
	}
	lr := &io.LimitedReader{R: resp.Body, N: maxDatasetBytes + 1}
	data, err := io.ReadAll(lr)
	if err != nil {
		return nil, err
	}
	if lr.N == 0 {
		return nil, fmt.Errorf("animemap: dataset exceeds %d bytes", maxDatasetBytes)
	}
	return data, nil
}

// ── dataset parsing ──────────────────────────────────────────────────────────

// flexInt decodes a JSON number or numeric string into an int.
type flexInt int

func (f *flexInt) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	if s == "" || s == "null" {
		*f = 0
		return nil
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		*f = 0
		return nil // tolerate odd values (e.g. slugs) rather than failing the load
	}
	*f = flexInt(n)
	return nil
}

// tmdbRef decodes Fribb's themoviedb_id, which is a bare number for movies or
// an object like {"tv": 37854} (rarely {"movie": n}) for scoped IDs.
type tmdbRef struct {
	Movie int
	TV    int
}

func (t *tmdbRef) UnmarshalJSON(b []byte) error {
	trimmed := strings.TrimSpace(string(b))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	if trimmed[0] == '{' {
		var obj struct {
			Movie flexInt `json:"movie"`
			TV    flexInt `json:"tv"`
		}
		if err := json.Unmarshal(b, &obj); err != nil {
			return nil
		}
		t.Movie, t.TV = int(obj.Movie), int(obj.TV)
		return nil
	}
	var n flexInt
	if err := json.Unmarshal(b, &n); err != nil {
		return nil
	}
	t.Movie = int(n)
	return nil
}

// seasonRef decodes Fribb's season field ({"tvdb":1,"tmdb":1}, a number, or a
// string) into a rank: 0 = no season info, 1 = first season, 2 = later season.
type seasonRef struct{ rank int }

func (s *seasonRef) UnmarshalJSON(b []byte) error {
	trimmed := strings.TrimSpace(string(b))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	season := 0
	if trimmed[0] == '{' {
		var obj struct {
			TMDB flexInt `json:"tmdb"`
			TVDB flexInt `json:"tvdb"`
		}
		if err := json.Unmarshal(b, &obj); err != nil {
			return nil
		}
		season = int(obj.TMDB)
		if season == 0 {
			season = int(obj.TVDB)
		}
	} else {
		var n flexInt
		if err := json.Unmarshal(b, &n); err != nil {
			return nil
		}
		season = int(n)
	}
	switch {
	case season <= 0:
		s.rank = 0
	case season == 1:
		s.rank = 1
	default:
		s.rank = 2
	}
	return nil
}

type datasetEntry struct {
	MALID     flexInt   `json:"mal_id"`
	AniListID flexInt   `json:"anilist_id"`
	KitsuID   flexInt   `json:"kitsu_id"`
	IMDbID    []string  `json:"imdb_id"`
	TMDBID    tmdbRef   `json:"themoviedb_id"`
	Season    seasonRef `json:"season"`
}

func buildIndexes(data []byte) (map[string]indexed, map[int]indexed, map[int]indexed, error) {
	var entries []datasetEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, nil, nil, err
	}
	if len(entries) == 0 {
		return nil, nil, nil, fmt.Errorf("empty dataset")
	}
	imdb := make(map[string]indexed)
	movie := make(map[int]indexed)
	tv := make(map[int]indexed)
	for _, e := range entries {
		ids := IDs{MAL: int(e.MALID), AniList: int(e.AniListID), Kitsu: int(e.KitsuID)}
		if ids.empty() {
			continue
		}
		item := indexed{ids: ids, rank: e.Season.rank}
		for _, imdbID := range e.IMDbID {
			if imdbID != "" {
				insert(imdb, imdbID, item)
			}
		}
		if e.TMDBID.Movie != 0 {
			insert(movie, e.TMDBID.Movie, item)
		}
		if e.TMDBID.TV != 0 {
			insert(tv, e.TMDBID.TV, item)
		}
	}
	return imdb, movie, tv, nil
}

// insert keeps the best-ranked entry per key: season-less or first-season
// rows beat later seasons, and the first row wins ties (dataset order).
func insert[K comparable](idx map[K]indexed, key K, item indexed) {
	if existing, ok := idx[key]; ok && existing.rank <= item.rank {
		return
	}
	idx[key] = item
}

// ── live API fallback ────────────────────────────────────────────────────────

// resolveFallback queries the live mapping API for IDs the dataset doesn't
// cover. Results — including misses — are cached so non-anime titles don't
// trigger a network call on every render.
func (m *Mapper) resolveFallback(ctx context.Context, id string) (IDs, bool) {
	if m.fallbackURL == "" {
		return IDs{}, false
	}

	m.fbMu.Lock()
	if e, ok := m.fbCache[id]; ok && time.Now().Before(e.expires) {
		m.fbMu.Unlock()
		return e.ids, e.ok
	}
	m.fbMu.Unlock()

	source := "themoviedb"
	if strings.HasPrefix(id, "tt") {
		source = "imdb"
	}

	// Construct URL with proper query parameter encoding
	u, err := url.Parse(m.fallbackURL + "/" + source)
	if err != nil {
		return IDs{}, false
	}
	q := u.Query()
	q.Set("id", id)
	q.Set("include", "myanimelist,anilist,kitsu")
	u.RawQuery = q.Encode()

	fctx, cancel := context.WithTimeout(ctx, fallbackTimeout)
	defer cancel()
	ids, found, err := m.fetchFallback(fctx, u.String())
	if err != nil {
		return IDs{}, false // transient failure: don't negative-cache
	}

	m.fbMu.Lock()
	if len(m.fbCache) >= fallbackCacheLimit {
		m.fbCache = make(map[string]fallbackEntry)
	}
	m.fbCache[id] = fallbackEntry{ids: ids, ok: found, expires: time.Now().Add(fallbackCacheTTL)}
	m.fbMu.Unlock()
	return ids, found
}

func (m *Mapper) fetchFallback(ctx context.Context, url string) (IDs, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return IDs{}, false, err
	}
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return IDs{}, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return IDs{}, false, nil
	}
	if resp.StatusCode != http.StatusOK {
		return IDs{}, false, fmt.Errorf("animemap: fallback http %d", resp.StatusCode)
	}
	var results []struct {
		MAL     flexInt `json:"myanimelist"`
		AniList flexInt `json:"anilist"`
		Kitsu   flexInt `json:"kitsu"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&results); err != nil {
		return IDs{}, false, err
	}
	for _, r := range results {
		ids := IDs{MAL: int(r.MAL), AniList: int(r.AniList), Kitsu: int(r.Kitsu)}
		if !ids.empty() {
			return ids, true, nil
		}
	}
	return IDs{}, false, nil
}
