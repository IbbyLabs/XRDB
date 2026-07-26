// Package animemap resolves IMDb and TMDB identifiers to anime-service IDs
// (MyAnimeList, AniList, Kitsu).
//
// The primary source is the community-maintained Fribb/anime-lists dataset,
// downloaded once and cached on disk so lookups are local and survive upstream
// outages. A secondary "supplement" source (nattadasu/animeApi) fills gaps the
// primary misses — chiefly anime films, OVAs and specials whose IMDb/TMDB
// linkage the Fribb lineage lacks. Entries missing from both datasets fall back
// to a live mapping API (arm.haglund.dev by default) with per-ID caching,
// including negative results.
//
// Supplement data (nattadasu/animeApi) is licensed ODbL v1.0 + DbCL v1.0;
// attribution: https://github.com/nattadasu/animeApi.
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

// Target is the mainstream identifier an anime id maps back to. Artwork and
// most rating sources are keyed on IMDb or TMDB, so an anime id has to be
// translated before anything else can be fetched for it.
type Target struct {
	IMDb string
	TMDB int
	// TMDBType is "movie" or "tv" when TMDB is set, and empty otherwise.
	TMDBType string
}

func (t Target) empty() bool { return t.IMDb == "" && t.TMDB == 0 }

// ParseAnimeID splits an anime-service id into its service and number.
// Recognises mal, myanimelist, anilist and kitsu, with or without a "series"
// or "movie" segment after the number.
func ParseAnimeID(id string) (service string, num int, ok bool) {
	id = strings.ToLower(strings.TrimSpace(id))
	prefix, rest, found := strings.Cut(id, ":")
	if !found {
		return "", 0, false
	}
	switch prefix {
	case "mal", "myanimelist":
		service = "mal"
	case "anilist":
		service = "anilist"
	case "kitsu":
		service = "kitsu"
	default:
		return "", 0, false
	}
	// Kitsu episode ids carry a trailing ":season:episode" or similar.
	if i := strings.Index(rest, ":"); i > 0 {
		rest = rest[:i]
	}
	n, err := strconv.Atoi(strings.TrimSpace(rest))
	if err != nil || n <= 0 {
		return "", 0, false
	}
	return service, n, true
}

// animeKey is the reverse-index key for one anime-service id.
func animeKey(service string, num int) string {
	return service + ":" + strconv.Itoa(num)
}

// reverseKeys returns every key a title should be findable under.
func reverseKeys(ids IDs) []string {
	keys := make([]string, 0, 3)
	if ids.MAL != 0 {
		keys = append(keys, animeKey("mal", ids.MAL))
	}
	if ids.AniList != 0 {
		keys = append(keys, animeKey("anilist", ids.AniList))
	}
	if ids.Kitsu != 0 {
		keys = append(keys, animeKey("kitsu", ids.Kitsu))
	}
	return keys
}

const (
	// DefaultDatasetURL is the Fribb/anime-lists "mini" list (~6 MB), which
	// carries every ID XRDB needs (mal/anilist/kitsu/imdb/themoviedb).
	DefaultDatasetURL = "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json"
	// DefaultDatasetMirrorURL is tried when the primary host is unreachable.
	DefaultDatasetMirrorURL = "https://cdn.jsdelivr.net/gh/Fribb/anime-lists@master/anime-list-mini.json"
	// DefaultFallbackURL is the live per-ID mapping API used for titles the
	// dataset doesn't cover yet. Set to "off" in Options to disable.
	DefaultFallbackURL = "https://arm.haglund.dev/api/v2"
	// DefaultSupplementURL is nattadasu/animeApi's aggregated dataset (~32 MB).
	// It is loaded as a secondary offline source for IMDb/TMDB titles the Fribb
	// primary and the live fallback both miss (mostly films/OVAs/specials). Set
	// to "off" in Options to disable. There is no public mirror large enough to
	// serve this file, so it has none; the disk cache and non-blocking load
	// keep it resilient to upstream outages.
	DefaultSupplementURL = "https://raw.githubusercontent.com/nattadasu/animeApi/v3/database/animeapi.json"

	datasetFileName    = "anime-map.json"
	supplementFileName = "anime-map-supplement.json"
	maxDatasetBytes    = 64 * 1024 * 1024
	downloadTimeout    = 60 * time.Second
	retryBackoff       = 5 * time.Minute
	fallbackTimeout    = 8 * time.Second
	fallbackCacheTTL   = 24 * time.Hour
	fallbackCacheLimit = 10000
)

// Options configures a Mapper.
type Options struct {
	CacheDir            string        // directory for the cached dataset files (required)
	DatasetURL          string        // override primary dataset URL (default Fribb anime-lists)
	MirrorURL           string        // override primary mirror URL
	FallbackURL         string        // live mapping API base URL; "off" disables
	SupplementURL       string        // secondary dataset URL (default nattadasu); "off" disables
	SupplementMirrorURL string        // optional mirror for the supplement (default none)
	TTL                 time.Duration // dataset refresh interval (default 7 days)
	HTTPClient          *http.Client  // override HTTP client (tests)
}

// Mapper resolves media IDs to anime-service IDs using disk-cached datasets
// with a live API fallback. Safe for concurrent use.
type Mapper struct {
	primary    *source // Fribb dataset (blocks first render until loaded)
	supplement *source // nattadasu dataset; nil when disabled (best-effort, non-blocking)
	httpClient *http.Client

	fallbackURL string
	fbMu        sync.Mutex
	fbCache     map[string]fallbackEntry
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

// datasetParser turns raw dataset bytes into the IMDb, TMDB-movie and TMDB-TV
// indexes plus the reverse index from anime id back to IMDb/TMDB. Different
// sources carry different on-disk schemas but share this index shape.
type datasetParser func(data []byte) (idx indexes, err error)

// indexes is one dataset's parsed lookup tables.
type indexes struct {
	imdb    map[string]indexed
	movie   map[int]indexed
	tv      map[int]indexed
	reverse map[string]Target
}

// source is one disk-cached dataset (primary or supplement) with its own
// indexes and refresh lifecycle. Safe for concurrent use.
type source struct {
	url        string
	mirror     string
	path       string
	ttl        time.Duration
	httpClient *http.Client
	parse      datasetParser
	// blocking makes the very first caller wait on the initial download so the
	// first anime render can succeed. The supplement is non-blocking: when it
	// has no data yet it downloads in the background and contributes once ready.
	blocking bool

	mu          sync.Mutex
	loaded      bool
	loadedAt    time.Time
	lastAttempt time.Time
	refreshing  bool
	loading     chan struct{} // non-nil while a blocking cold-load is in flight (single-flight)
	byIMDb      map[string]indexed
	byTMDBMovie map[int]indexed
	byTMDBTV    map[int]indexed
	byAnimeID   map[string]Target
}

// New creates a Mapper. Datasets load lazily on first Resolve.
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
	if opts.SupplementURL == "" {
		opts.SupplementURL = DefaultSupplementURL
	}
	if strings.EqualFold(opts.SupplementURL, "off") {
		opts.SupplementURL = ""
	}
	if opts.TTL <= 0 {
		opts.TTL = 7 * 24 * time.Hour
	}
	if opts.HTTPClient == nil {
		opts.HTTPClient = &http.Client{Timeout: downloadTimeout}
	}

	m := &Mapper{
		httpClient:  opts.HTTPClient,
		fallbackURL: strings.TrimRight(opts.FallbackURL, "/"),
		fbCache:     make(map[string]fallbackEntry),
		primary: &source{
			url:        opts.DatasetURL,
			mirror:     opts.MirrorURL,
			path:       filepath.Join(opts.CacheDir, datasetFileName),
			ttl:        opts.TTL,
			httpClient: opts.HTTPClient,
			parse:      buildIndexes,
			blocking:   true,
		},
	}
	if opts.SupplementURL != "" {
		m.supplement = &source{
			url:        opts.SupplementURL,
			mirror:     opts.SupplementMirrorURL,
			path:       filepath.Join(opts.CacheDir, supplementFileName),
			ttl:        opts.TTL,
			httpClient: opts.HTTPClient,
			parse:      buildSupplementIndexes,
			blocking:   false,
		}
	}
	return m
}

// Resolve maps a media ID (IMDb "tt…" or numeric TMDB) to anime-service IDs.
// mediaType is the render type (poster/backdrop/…) and is only used to break
// the movie/TV ambiguity of bare numeric TMDB IDs, mirroring the TMDB
// provider's heuristic. The primary dataset is consulted first, then the
// supplement, then the live fallback. Returns ok=false when the title isn't a
// known anime.
func (m *Mapper) Resolve(ctx context.Context, mediaType, id string) (IDs, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return IDs{}, false
	}
	if ids, ok := m.primary.lookup(mediaType, id); ok {
		return ids, true
	}
	if m.supplement != nil {
		if ids, ok := m.supplement.lookup(mediaType, id); ok {
			return ids, true
		}
	}
	return m.resolveFallback(ctx, id)
}

// ResolveTarget maps an anime-service id back to its IMDb/TMDB identifier.
// Catalogues sourced from MAL or Kitsu hand out ids like "kitsu:123", which no
// artwork or rating source understands on its own.
func (m *Mapper) ResolveTarget(ctx context.Context, id string) (Target, bool) {
	service, num, ok := ParseAnimeID(id)
	if !ok {
		return Target{}, false
	}
	key := animeKey(service, num)
	if t, ok := m.primary.lookupTarget(key); ok {
		return t, true
	}
	if m.supplement != nil {
		if t, ok := m.supplement.lookupTarget(key); ok {
			return t, true
		}
	}
	return Target{}, false
}

// lookupTarget resolves an anime id against this source's reverse index.
func (s *source) lookupTarget(key string) (Target, bool) {
	s.ensureLoaded()
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.byAnimeID[key]
	if !ok || t.empty() {
		return Target{}, false
	}
	return t, true
}

// lookup loads the source if needed, then resolves id against its indexes.
func (s *source) lookup(mediaType, id string) (IDs, bool) {
	s.ensureLoaded()
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lookupLocked(mediaType, id)
}

func (s *source) lookupLocked(mediaType, id string) (IDs, bool) {
	if strings.HasPrefix(id, "tt") {
		if e, ok := s.byIMDb[id]; ok {
			return e.ids, true
		}
		return IDs{}, false
	}
	n, err := strconv.Atoi(id)
	if err != nil {
		return IDs{}, false
	}
	// Bare numeric TMDB IDs are ambiguous between movie and TV; prefer the space
	// implied by the content type and try the other second rather than failing.
	first, second := s.byTMDBMovie, s.byTMDBTV
	if mediaType == "tv" || mediaType == "series" || mediaType == "show" {
		first, second = s.byTMDBTV, s.byTMDBMovie
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
// stale. For a blocking source a missing dataset downloads synchronously
// (single-flight, throttled) so the first render can still succeed; for a
// non-blocking source it downloads in the background. A stale-but-present
// dataset is always served immediately and refreshed in the background so
// render latency never depends on the upstream host.
func (s *source) ensureLoaded() {
	s.mu.Lock()

	if !s.loaded {
		if err := s.loadFromDiskLocked(); err == nil {
			s.loaded = true
		}
	}
	// A blocking cold-load is already in flight: wait for it instead of falling
	// through to a lookup on empty indexes. This makes the first download a true
	// single-flight for concurrent callers, honoring the blocking guarantee.
	if !s.loaded && s.loading != nil {
		ch := s.loading
		s.mu.Unlock()
		<-ch
		return
	}
	stale := !s.loaded || time.Since(s.loadedAt) > s.ttl
	if !stale || s.refreshing || time.Since(s.lastAttempt) < retryBackoff {
		s.mu.Unlock()
		return
	}
	s.lastAttempt = time.Now()
	if s.loaded || !s.blocking {
		// Already have usable data (background refresh), or a non-blocking
		// source with no data yet (background initial download).
		s.refreshing = true
		go s.refresh()
		s.mu.Unlock()
		return
	}
	// Blocking source with no usable dataset at all: download synchronously so
	// the very first anime render can still succeed, and publish a loading
	// channel so concurrent callers wait on this same load.
	ch := make(chan struct{})
	s.loading = ch
	s.mu.Unlock()

	// Always reset loading and unblock waiters — even if downloadAndStore
	// panics — so a panic can't permanently wedge every future blocking caller
	// on a channel that never closes.
	defer func() {
		s.mu.Lock()
		s.loading = nil
		close(ch)
		s.mu.Unlock()
	}()

	err := s.downloadAndStore()

	s.mu.Lock()
	if err == nil {
		if err := s.loadFromDiskLocked(); err == nil {
			s.loaded = true
		}
	}
	s.mu.Unlock()
}

func (s *source) refresh() {
	err := s.downloadAndStore()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.refreshing = false
	if err == nil {
		if err := s.loadFromDiskLocked(); err == nil {
			s.loaded = true
		}
	}
}

func (s *source) loadFromDiskLocked() error {
	info, err := os.Stat(s.path)
	if err != nil {
		return err
	}
	data, err := os.ReadFile(s.path)
	if err != nil {
		return err
	}
	idx, err := s.parse(data)
	if err != nil {
		return err
	}
	s.byIMDb, s.byTMDBMovie, s.byTMDBTV, s.byAnimeID = idx.imdb, idx.movie, idx.tv, idx.reverse
	s.loadedAt = info.ModTime()
	return nil
}

func (s *source) downloadAndStore() error {
	data, err := s.fetchDataset(s.url)
	if err != nil && s.mirror != "" {
		data, err = s.fetchDataset(s.mirror)
	}
	if err != nil {
		return err
	}
	// Validate before persisting so a bad body never replaces a good cache.
	if _, err := s.parse(data); err != nil {
		return fmt.Errorf("animemap: invalid dataset: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *source) fetchDataset(url string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), downloadTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.httpClient.Do(req)
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

func buildIndexes(data []byte) (indexes, error) {
	var entries []datasetEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return indexes{}, err
	}
	if len(entries) == 0 {
		return indexes{}, fmt.Errorf("empty dataset")
	}
	idx := indexes{
		imdb:    make(map[string]indexed),
		movie:   make(map[int]indexed),
		tv:      make(map[int]indexed),
		reverse: make(map[string]Target),
	}
	ranks := make(map[string]int)
	for _, e := range entries {
		ids := IDs{MAL: int(e.MALID), AniList: int(e.AniListID), Kitsu: int(e.KitsuID)}
		if ids.empty() {
			continue
		}
		item := indexed{ids: ids, rank: e.Season.rank}
		var target Target
		for _, imdbID := range e.IMDbID {
			if imdbID != "" {
				insert(idx.imdb, imdbID, item)
				if target.IMDb == "" {
					target.IMDb = imdbID
				}
			}
		}
		if e.TMDBID.Movie != 0 {
			insert(idx.movie, e.TMDBID.Movie, item)
			if target.TMDB == 0 {
				target.TMDB, target.TMDBType = e.TMDBID.Movie, "movie"
			}
		}
		if e.TMDBID.TV != 0 {
			insert(idx.tv, e.TMDBID.TV, item)
			if target.TMDB == 0 {
				target.TMDB, target.TMDBType = e.TMDBID.TV, "tv"
			}
		}
		insertTarget(idx.reverse, ranks, ids, target, e.Season.rank)
	}
	return idx, nil
}

// insertTarget records the mainstream ids a title maps back to, under every
// anime id it is known by. Ranking matches insert: an earlier season wins, and
// the first row wins ties. ranks carries the rank each key was stored at.
func insertTarget(rev map[string]Target, ranks map[string]int, ids IDs, target Target, rank int) {
	if target.empty() {
		return
	}
	for _, key := range reverseKeys(ids) {
		if _, ok := rev[key]; ok && ranks[key] <= rank {
			continue
		}
		rev[key] = target
		ranks[key] = rank
	}
}

// supplementEntry mirrors the relevant fields of a nattadasu/animeApi row.
// Numeric fields tolerate JSON null and string-encoded numbers via flexInt.
type supplementEntry struct {
	IMDb     string  `json:"imdb"`
	TMDB     flexInt `json:"themoviedb"`
	TMDBType string  `json:"themoviedb_type"`
	MAL      flexInt `json:"myanimelist"`
	AniList  flexInt `json:"anilist"`
	Kitsu    flexInt `json:"kitsu"`
}

// buildSupplementIndexes parses the nattadasu/animeApi dataset. It indexes only
// rows that carry an IMDb/TMDB key and at least one target ID, so the large raw
// file collapses to the few thousand entries XRDB can actually use.
func buildSupplementIndexes(data []byte) (indexes, error) {
	var entries []supplementEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return indexes{}, err
	}
	if len(entries) == 0 {
		return indexes{}, fmt.Errorf("empty supplement dataset")
	}
	imdb := make(map[string]indexed)
	movie := make(map[int]indexed)
	tv := make(map[int]indexed)
	reverse := make(map[string]Target)
	ranks := make(map[string]int)
	for _, e := range entries {
		ids := IDs{MAL: int(e.MAL), AniList: int(e.AniList), Kitsu: int(e.Kitsu)}
		if ids.empty() {
			continue
		}
		// The supplement has no season field; rank 0 means first-seen wins on
		// the rare duplicate key, matching insert's tie-break.
		item := indexed{ids: ids, rank: 0}
		var target Target
		if strings.HasPrefix(e.IMDb, "tt") {
			insert(imdb, e.IMDb, item)
			target.IMDb = e.IMDb
		}
		if n := int(e.TMDB); n != 0 {
			target.TMDB = n
			target.TMDBType = "movie"
			if strings.EqualFold(e.TMDBType, "tv") {
				target.TMDBType = "tv"
			}
			// Use the explicit type; an unknown/blank type goes to the movie
			// index, and lookup's movie⇄TV fall-through still resolves it.
			if strings.EqualFold(e.TMDBType, "tv") {
				insert(tv, n, item)
			} else {
				insert(movie, n, item)
			}
		}
		insertTarget(reverse, ranks, ids, target, 0)
	}
	if len(imdb) == 0 && len(movie) == 0 && len(tv) == 0 {
		return indexes{}, fmt.Errorf("supplement dataset has no usable mappings")
	}
	return indexes{imdb: imdb, movie: movie, tv: tv, reverse: reverse}, nil
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

// resolveFallback queries the live mapping API for IDs the datasets don't
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
