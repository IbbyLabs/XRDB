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
	"log/slog"
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
	AniDB   int
}

func (ids IDs) empty() bool {
	return ids.MAL == 0 && ids.AniList == 0 && ids.Kitsu == 0 && ids.AniDB == 0
}

// ratingComplete reports whether the three ids the rating providers key on are
// all present, so a lookup can stop before consulting a slower source.
func (ids IDs) ratingComplete() bool {
	return ids.MAL != 0 && ids.AniList != 0 && ids.Kitsu != 0
}

// mergeIDs fills a's zero fields from b, so a partial hit from one source has its
// gaps filled by the next. a's non-zero values win, keeping the earlier (more
// authoritative) source's ids where it has them.
func mergeIDs(a, b IDs) IDs {
	if a.MAL == 0 {
		a.MAL = b.MAL
	}
	if a.AniList == 0 {
		a.AniList = b.AniList
	}
	if a.Kitsu == 0 {
		a.Kitsu = b.Kitsu
	}
	if a.AniDB == 0 {
		a.AniDB = b.AniDB
	}
	return a
}

// Target is the mainstream identifier an anime id maps back to. Artwork and
// most rating sources are keyed on IMDb or TMDB, so an anime id has to be
// translated before anything else can be fetched for it.
type Target struct {
	IMDb string
	TMDB int
	// TMDBType is "movie" or "tv" when TMDB is set, and empty otherwise.
	TMDBType string
}

// reverseEntry is what an anime id maps back to. Kitsu rides beside the target
// because a seasonal title often has one for weeks before TMDB or IMDb catch
// up, and Kitsu is the only anime service XRDB can draw artwork from — there is
// no AniList artwork source to fall back to.
type reverseEntry struct {
	Target Target
	Kitsu  int
}

// renderable reports whether a row can produce a poster by some route. A row
// with no mainstream id and no Kitsu id cannot, under this fix or any other, so
// indexing it costs memory for a render nobody can serve. In the current
// dataset that is 20,384 rows of 42,868.
func renderable(ids IDs, target Target) bool {
	return !target.empty() || ids.Kitsu != 0
}

func (t Target) empty() bool { return t.IMDb == "" && t.TMDB == 0 }

// ParseAnimeID splits an anime-service id into its service and number.
// Recognises mal, myanimelist, anilist and kitsu, with or without a "series"
// withoutTypeToken drops a leading content-type token from an id.
//
// A caller may put the type in front ("series:mal:21", "movie:tt14967958"),
// which is the shape AIOMetadata emits from {type}:{id}. The type says nothing
// about which service the id belongs to, so anything deciding by the id's own
// prefix has to strip it first or it reads the type instead of the id.
// withoutSourceToken reduces a render-path TMDB id to the bare number the maps
// are keyed on. An id naming its own space settles the movie/TV ambiguity that
// mediaType otherwise has to guess at.
func withoutSourceToken(mediaType, id string) (string, string) {
	rest, ok := strings.CutPrefix(id, "tmdb:")
	if !ok {
		return mediaType, id
	}
	if bare, ok := strings.CutPrefix(rest, "movie:"); ok {
		return "movie", bare
	}
	if bare := withoutTypeToken(rest); bare != rest {
		return "series", bare
	}
	return mediaType, rest
}

func withoutTypeToken(id string) string {
	for _, tok := range []string{"movie:", "series:", "tv:"} {
		if rest, ok := strings.CutPrefix(id, tok); ok {
			return rest
		}
	}
	return id
}

// lookupTarget reduces an id to the bare identifier the live API takes, and
// names the endpoint it belongs to.
//
// Ids arrive as <id>, <type>:<id> and <service>:<type>:<id>. Dropping one known
// token from the front leaves the remaining segments in the query, and neither
// endpoint can parse those. ok is false for a service the live API has no
// endpoint for, so the call is skipped rather than sent to be refused.
func lookupTarget(id string) (source, bare string, ok bool) {
	typeToken := map[string]bool{"movie": true, "series": true, "tv": true, "show": true}
	endpoint := map[string]string{
		"imdb":       "imdb",
		"tmdb":       "themoviedb",
		"themoviedb": "themoviedb",
	}
	unsupported := map[string]bool{"mal": true, "myanimelist": true, "anilist": true, "kitsu": true}

	for _, seg := range strings.Split(id, ":") {
		lower := strings.ToLower(strings.TrimSpace(seg))
		switch {
		case lower == "":
		case typeToken[lower]:
		case unsupported[lower]:
			return "", "", false
		case endpoint[lower] != "":
			source = endpoint[lower]
		default:
			bare = seg
		}
	}
	if bare == "" {
		return "", "", false
	}
	if source == "" {
		source = "themoviedb"
		if strings.HasPrefix(strings.ToLower(bare), "tt") {
			source = "imdb"
		}
	}
	return source, bare, true
}

// or "movie" segment after the number.
func ParseAnimeID(id string) (service string, num int, ok bool) {
	id = withoutTypeToken(strings.ToLower(strings.TrimSpace(id)))
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
	case "anidb":
		service = "anidb"
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
	if ids.AniDB != 0 {
		keys = append(keys, animeKey("anidb", ids.AniDB))
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
	fbInflight  map[string]*fbCall
}

// fbCall is one in-progress fallback lookup. Three anime sources are asked
// whether they apply to the same title concurrently, and each miss reaches the
// live API, so callers arriving for a key already being fetched wait on that
// fetch instead of starting their own. The fetch runs on a detached context;
// one caller walking away must not abandon the others.
type fbCall struct {
	done    chan struct{}
	cancel  context.CancelFunc
	waiters int // guarded by Mapper.fbMu
	ids     IDs
	ok      bool
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
	reverse map[string]reverseEntry
	// seasons holds every aired season of a series, keyed by IMDb id and by
	// "tv:<tmdb id>". Anime catalogues number by aired season while TMDB often
	// packs several into one.
	seasons map[string][]seasonRow
	// partialSeasons marks a series carrying an aired season with no TMDB
	// season beside it. Whether a season is packed is judged by scanning its
	// siblings, and a sibling that names no TMDB season cannot be scanned, so
	// the series is refused rather than read from what is left.
	partialSeasons map[string]bool
}

// seasonRow is one aired season of a series and where TMDB files its episodes.
type seasonRow struct {
	aired      int
	tmdbSeason int
	offset     int
	hasOffset  bool
}

// SeasonMapping is where an aired season's episodes sit on TMDB. The zero value
// is unusable on purpose: season 0 is TMDB's specials season, so a caller that
// ignored the refusal would otherwise ask for it rather than fail.
type SeasonMapping struct {
	TMDBSeason int
	// EpisodeDelta is added to the requested episode number.
	EpisodeDelta int
	resolved     bool
}

// Resolved reports whether this mapping came from a conversion. Read it before
// using the fields.
func (m SeasonMapping) Resolved() bool { return m.resolved }

// SeasonRefusal names why a conversion did not resolve. A refusal and a title
// nobody has ever recorded produce the same render, so the reason is returned
// rather than inferred from an absence.
type SeasonRefusal string

const (
	SeasonResolved SeasonRefusal = ""
	// SeasonNoRows is a series with no aired seasons recorded.
	SeasonNoRows SeasonRefusal = "no_rows"
	// SeasonUnknownAired is a series recorded without the season asked for.
	SeasonUnknownAired SeasonRefusal = "unknown_aired_season"
	// SeasonContradictory is one aired season filed under two TMDB seasons.
	SeasonContradictory SeasonRefusal = "aired_season_in_two_tmdb_seasons"
	// SeasonSplitIntoCours is a packed season described by several rows, where
	// choosing between them needs an offset the air dates do not confirm.
	SeasonSplitIntoCours SeasonRefusal = "packed_season_split_into_cours"
	// SeasonAmbiguousOffset is a season alone in its TMDB season yet carrying an
	// offset, which the dataset does not say what to count from.
	SeasonAmbiguousOffset SeasonRefusal = "exclusive_season_with_offset"
	// SeasonPartialSeries is a series carrying an aired season with no TMDB
	// season beside it, leaving the packing scan an incomplete set.
	SeasonPartialSeries SeasonRefusal = "series_missing_a_tmdb_season"
)

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
	byAnimeID   map[string]reverseEntry
	bySeason    map[string][]seasonRow
	partialSeas map[string]bool
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
		fbInflight:  make(map[string]*fbCall),
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
	mediaType, id = withoutSourceToken(mediaType, id)
	// Merge across sources rather than returning the first hit. A source can hold
	// a partial mapping — a Kitsu id but no MAL or AniList — and returning it would
	// shadow the complete answer a later source has. Each source fills the gaps the
	// previous left, and the search stops once the rating ids are all present.
	var out IDs
	found := false
	if ids, ok := m.primary.lookup(mediaType, id); ok {
		out = mergeIDs(out, ids)
		found = true
	}
	if !out.ratingComplete() && m.supplement != nil {
		if ids, ok := m.supplement.lookup(mediaType, id); ok {
			out = mergeIDs(out, ids)
			found = true
		}
	}
	if !out.ratingComplete() {
		if ids, ok := m.resolveFallback(ctx, id); ok {
			out = mergeIDs(out, ids)
			found = true
		}
	}
	if found {
		return out, true
	}
	return IDs{}, false
}

// ResolveTarget maps an anime-service id back to its IMDb/TMDB identifier.
// Catalogues sourced from MAL or Kitsu hand out ids like "kitsu:123", which no
// artwork or rating source understands on its own.
// SeasonFor converts a catalogue's aired season into the TMDB season holding
// its episodes. seriesKey is an IMDb id or "tv:<tmdb id>".
//
// Four cases, and only the first moves an episode number:
//
//   - the TMDB season holds several aired seasons, so the episodes are packed
//     end to end and the offset says where this one starts. One row only: a
//     season split into cours needs the aired-side offset to choose between
//     them, which the air dates do not confirm;
//   - the TMDB season holds this aired season alone and several rows describe
//     it, so the offsets mark cours inside one season and the number already
//     counts across it;
//   - one row, no offset, so the two numberings agree;
//   - one row carrying an offset. The dataset does not say what it counts from
//     and the air dates do not settle it, so this refuses rather than risk an
//     episode that is wrong by one and looks right.
//
// Two further refusals: rows disagreeing about which TMDB season an aired season
// belongs to, and a series carrying an aired season with no TMDB season beside
// it, which leaves the packing scan reading an incomplete set.
func (m *Mapper) SeasonFor(seriesKey string, aired int) (SeasonMapping, SeasonRefusal) {
	for _, src := range []*source{m.primary, m.supplement} {
		if src == nil {
			continue
		}
		rows, partial := src.seasonRows(seriesKey)
		if partial {
			return SeasonMapping{}, SeasonPartialSeries
		}
		if len(rows) > 0 {
			return mapSeason(rows, aired)
		}
	}
	return SeasonMapping{}, SeasonNoRows
}

func mapSeason(rows []seasonRow, aired int) (SeasonMapping, SeasonRefusal) {
	var match []seasonRow
	for _, r := range rows {
		if r.aired == aired {
			match = append(match, r)
		}
	}
	if len(match) == 0 {
		return SeasonMapping{}, SeasonUnknownAired
	}
	target := match[0].tmdbSeason
	for _, r := range match[1:] {
		if r.tmdbSeason != target {
			return SeasonMapping{}, SeasonContradictory
		}
	}
	packed := false
	for _, r := range rows {
		if r.tmdbSeason == target && r.aired != aired {
			packed = true
			break
		}
	}
	if packed {
		// Several rows for one aired season are its cours, each starting at its
		// own point. Picking between them needs the aired-side offset and the
		// air dates do not confirm what it counts from, so this refuses.
		if len(match) > 1 {
			return SeasonMapping{}, SeasonSplitIntoCours
		}
		return SeasonMapping{TMDBSeason: target, EpisodeDelta: match[0].offset, resolved: true}, SeasonResolved
	}
	if len(match) == 1 && match[0].hasOffset {
		return SeasonMapping{}, SeasonAmbiguousOffset
	}
	return SeasonMapping{TMDBSeason: target, resolved: true}, SeasonResolved
}

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

// ResolveKitsu maps an anime-service id to its Kitsu sibling. It answers for
// the titles ResolveTarget cannot: a recent season carries a Kitsu id for weeks
// before TMDB or IMDb pick it up, and until then Kitsu is the only place a
// poster can come from. Returns false when the id is already Kitsu's own, since
// translating it to itself buys nothing.
func (m *Mapper) ResolveKitsu(ctx context.Context, id string) (int, bool) {
	service, num, ok := ParseAnimeID(id)
	if !ok || service == "kitsu" {
		return 0, false
	}
	key := animeKey(service, num)
	if e, ok := m.primary.lookupReverse(key); ok && e.Kitsu != 0 {
		return e.Kitsu, true
	}
	if m.supplement != nil {
		if e, ok := m.supplement.lookupReverse(key); ok && e.Kitsu != 0 {
			return e.Kitsu, true
		}
	}
	return 0, false
}

// lookupTarget resolves an anime id against this source's reverse index.
func (s *source) lookupTarget(key string) (Target, bool) {
	e, ok := s.lookupReverse(key)
	if !ok || e.Target.empty() {
		return Target{}, false
	}
	return e.Target, true
}

// lookupReverse returns the whole entry, including a Kitsu id for a row that
// has no mainstream one.
func (s *source) lookupReverse(key string) (reverseEntry, bool) {
	s.ensureLoaded()
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.byAnimeID[key]
	return e, ok
}

// seasonRows returns every aired season recorded for a series, and whether the
// series was dropped for carrying a season with no TMDB number.
func (s *source) seasonRows(key string) ([]seasonRow, bool) {
	s.ensureLoaded()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.partialSeas[key] {
		return nil, true
	}
	return s.bySeason[key], false
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
	s.bySeason, s.partialSeas = idx.seasons, idx.partialSeasons
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

// seasonlessRank is the rank of a supplement row: it carries neither a type nor
// a season, so it loses to any typed row and the first seen wins among its own.
const seasonlessRank = typeRankUnknown * seasonRanks

// seasonRef decodes Fribb's season field ({"tvdb":1,"tmdb":1}, a number, or a
// string) into a rank, lowest wins: 0 = first season, 1 = later season, 2 =
// season 0 or absent. Season 0 is where the dataset files specials and OVAs,
// and several of those share the series' IMDb id.
type seasonRef struct {
	rank int
	// tvdb and tmdb are the season numbers themselves, zero when absent. The
	// rank above is a coarse ordering; these are what a numbering conversion
	// reads.
	tvdb, tmdb int
}

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
		s.tmdb, s.tvdb = int(obj.TMDB), int(obj.TVDB)
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
		s.tvdb, s.tmdb = season, season
	}
	switch {
	case season == 1:
		s.rank = 0
	case season >= 2:
		s.rank = 1
	default:
		s.rank = 2
	}
	return nil
}

// offsetRef decodes Fribb's episode_offset, which is {"tvdb":13,"tmdb":13}, a
// bare number, or absent. Only the TMDB figure is read; XRDB numbers episodes
// against TMDB.
type offsetRef struct {
	tmdb int
	set  bool
}

func (o *offsetRef) UnmarshalJSON(b []byte) error {
	trimmed := strings.TrimSpace(string(b))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	if trimmed[0] == '{' {
		var obj struct {
			TMDB flexInt `json:"tmdb"`
			TVDB flexInt `json:"tvdb"`
		}
		if err := json.Unmarshal(b, &obj); err != nil {
			return nil
		}
		o.tmdb, o.set = int(obj.TMDB), true
		if o.tmdb == 0 {
			o.tmdb = int(obj.TVDB)
		}
		return nil
	}
	var n flexInt
	if err := json.Unmarshal(b, &n); err != nil {
		return nil
	}
	o.tmdb, o.set = int(n), true
	return nil
}

// Type ranks, lowest wins. What an entry *is* decides which row owns a shared
// IMDb id: a franchise files its specials and OVAs against the series' id, and
// a season number only correlates with the answer.
const (
	typeRankTV = iota
	typeRankONA
	typeRankMovie
	typeRankOVA
	typeRankSpecial
	typeRankUnknown
	// seasonRanks is how many season ranks fit under one type rank, so type
	// decides first and season breaks ties within a type.
	seasonRanks = 3
)

func rankForType(t string) int {
	switch strings.ToUpper(strings.TrimSpace(t)) {
	case "TV":
		return typeRankTV
	case "ONA":
		return typeRankONA
	case "MOVIE":
		return typeRankMovie
	case "OVA":
		return typeRankOVA
	case "SPECIAL":
		return typeRankSpecial
	}
	return typeRankUnknown
}

type datasetEntry struct {
	Type      string    `json:"type"`
	MALID     flexInt   `json:"mal_id"`
	AniListID flexInt   `json:"anilist_id"`
	KitsuID   flexInt   `json:"kitsu_id"`
	AniDBID   flexInt   `json:"anidb_id"`
	IMDbID    []string  `json:"imdb_id"`
	TMDBID    tmdbRef   `json:"themoviedb_id"`
	Season    seasonRef `json:"season"`
	Offset    offsetRef `json:"episode_offset"`
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
		imdb:           make(map[string]indexed),
		movie:          make(map[int]indexed),
		tv:             make(map[int]indexed),
		reverse:        make(map[string]reverseEntry),
		seasons:        make(map[string][]seasonRow),
		partialSeasons: make(map[string]bool),
	}
	ranks := make(map[string]int)
	for _, e := range entries {
		ids := IDs{MAL: int(e.MALID), AniList: int(e.AniListID), Kitsu: int(e.KitsuID), AniDB: int(e.AniDBID)}
		if ids.empty() {
			continue
		}
		rank := rankForType(e.Type)*seasonRanks + e.Season.rank
		item := indexed{ids: ids, rank: rank}
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
		insertTarget(idx.reverse, ranks, ids, target, rank)
		if e.Season.tvdb > 0 && e.Season.tmdb == 0 {
			for _, imdbID := range e.IMDbID {
				if imdbID != "" {
					idx.partialSeasons[imdbID] = true
				}
			}
			if e.TMDBID.TV != 0 {
				idx.partialSeasons["tv:"+strconv.Itoa(e.TMDBID.TV)] = true
			}
		}
		if e.Season.tvdb > 0 && e.Season.tmdb > 0 {
			row := seasonRow{
				aired:      e.Season.tvdb,
				tmdbSeason: e.Season.tmdb,
				offset:     e.Offset.tmdb,
				hasOffset:  e.Offset.set,
			}
			for _, imdbID := range e.IMDbID {
				if imdbID != "" {
					idx.seasons[imdbID] = append(idx.seasons[imdbID], row)
				}
			}
			if e.TMDBID.TV != 0 {
				k := "tv:" + strconv.Itoa(e.TMDBID.TV)
				idx.seasons[k] = append(idx.seasons[k], row)
			}
		}
	}
	return idx, nil
}

// insertTarget records the mainstream ids a title maps back to, under every
// anime id it is known by. Ranking matches insert: an earlier season wins, and
// the first row wins ties. ranks carries the rank each key was stored at.
func insertTarget(rev map[string]reverseEntry, ranks map[string]int, ids IDs, target Target, rank int) {
	if !renderable(ids, target) {
		return
	}
	entry := reverseEntry{Target: target, Kitsu: ids.Kitsu}
	for _, key := range reverseKeys(ids) {
		if _, ok := rev[key]; ok && ranks[key] <= rank {
			continue
		}
		rev[key] = entry
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
	reverse := make(map[string]reverseEntry)
	ranks := make(map[string]int)
	for _, e := range entries {
		ids := IDs{MAL: int(e.MAL), AniList: int(e.AniList), Kitsu: int(e.Kitsu)}
		if ids.empty() {
			continue
		}
		// The supplement has no season field, so every row ranks as season-less
		// and the first seen wins a duplicate key, matching insert's tie-break.
		item := indexed{ids: ids, rank: seasonlessRank}
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
		insertTarget(reverse, ranks, ids, target, seasonlessRank)
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
	if call, ok := m.fbInflight[id]; ok {
		call.waiters++
		m.fbMu.Unlock()
		defer func() {
			m.fbMu.Lock()
			call.waiters--
			if call.waiters == 0 {
				call.cancel()
			}
			m.fbMu.Unlock()
		}()
		m.log().Debug("Waiting on an anime mapping lookup already in flight",
			"id", id)
		select {
		case <-call.done:
			return call.ids, call.ok
		case <-ctx.Done():
			return IDs{}, false
		}
	}

	callCtx, callCancel := context.WithTimeout(context.Background(), fallbackTimeout)
	call := &fbCall{done: make(chan struct{}), cancel: callCancel, waiters: 1}
	m.fbInflight[id] = call
	m.fbMu.Unlock()

	defer func() {
		m.fbMu.Lock()
		call.waiters--
		if call.waiters == 0 {
			call.cancel()
		}
		m.fbMu.Unlock()
	}()

	go m.runFallback(callCtx, id, call)

	select {
	case <-call.done:
		return call.ids, call.ok
	case <-ctx.Done():
		return IDs{}, false
	}
}

// runFallback performs the one outbound lookup the waiters are sharing.
func (m *Mapper) runFallback(ctx context.Context, id string, call *fbCall) {
	defer close(call.done)
	defer func() {
		m.fbMu.Lock()
		delete(m.fbInflight, id)
		m.fbMu.Unlock()
	}()

	// The id may still carry its type token, and an IMDb id behind one does not
	// start with "tt" — it goes to the TMDB endpoint and is rejected, so the
	// live lookup can never succeed for anything addressed as {type}:{id}.
	source, lookupID, ok := lookupTarget(id)
	if !ok {
		m.log().Debug("Skipping the live anime mapping lookup; the id names no endpoint it serves",
			"id", id)
		return
	}

	// Construct URL with proper query parameter encoding
	u, err := url.Parse(m.fallbackURL + "/" + source)
	if err != nil {
		m.log().Warn("Failed to build the anime mapping lookup URL",
			"id", id, "error", err)
		return
	}
	q := u.Query()
	q.Set("id", lookupID)
	q.Set("include", "myanimelist,anilist,kitsu")
	u.RawQuery = q.Encode()

	m.log().Debug("Asking the live anime mapping API about a title",
		"id", id, "source", source)

	ids, found, err := m.fetchFallback(ctx, u.String())
	if err != nil {
		// Transient failure: don't negative-cache, and let the next render ask
		// again rather than treating the title as settled.
		m.log().Warn("The live anime mapping lookup failed",
			"id", id, "source", source, "error", err)
		return
	}

	call.ids, call.ok = ids, found

	m.fbMu.Lock()
	m.evictIfFullLocked()
	m.fbCache[id] = fallbackEntry{ids: ids, ok: found, expires: time.Now().Add(fallbackCacheTTL)}
	m.fbMu.Unlock()

	m.log().Debug("The live anime mapping API answered",
		"id", id, "mapped", found)
}

// evictIfFullLocked keeps the cache under its limit, reclaiming expired entries
// before resorting to replacing the map. A wholesale clear discards titles asked
// for seconds earlier along with the cold ones, sending the next renders back to
// the API together. Callers hold fbMu.
func (m *Mapper) evictIfFullLocked() {
	if len(m.fbCache) < fallbackCacheLimit {
		return
	}
	now := time.Now()
	for id, e := range m.fbCache {
		if now.After(e.expires) {
			delete(m.fbCache, id)
		}
	}
	if len(m.fbCache) >= fallbackCacheLimit {
		m.fbCache = make(map[string]fallbackEntry)
	}
}

func (m *Mapper) log() *slog.Logger { return slog.Default() }

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
	// The API returns an array whose elements can be different seasons, some
	// carrying only a partial set of ids. Return the most complete element rather
	// than the first non-empty one, so which element happens to come first does not
	// decide what the caller gets. Elements are not merged: that would pair ids
	// belonging to different seasons.
	var best IDs
	bestScore := 0
	for _, r := range results {
		ids := IDs{MAL: int(r.MAL), AniList: int(r.AniList), Kitsu: int(r.Kitsu)}
		score := 0
		if ids.MAL != 0 {
			score++
		}
		if ids.AniList != 0 {
			score++
		}
		if ids.Kitsu != 0 {
			score++
		}
		if score > bestScore {
			best, bestScore = ids, score
		}
	}
	if bestScore > 0 {
		return best, true, nil
	}
	return IDs{}, false, nil
}
