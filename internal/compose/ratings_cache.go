package compose

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/provider"
)

// DefaultRatingsCacheTTL is how long a source's answer for one title stands in
// for another fetch of the same title. A server replaces this at startup with
// XRDB_RATINGS_CACHE_TTL_HOURS, whose own default is 24h, so this value binds
// only a pipeline built without SetRatingsCacheTTL.
const DefaultRatingsCacheTTL = 6 * time.Hour

// PartialRatingsCacheTTL is how long an answer stands when it carries fewer
// sources than the same title carried before. A metered source that has spent
// its allowance drops sources without failing, so the thin answer is cached
// briefly and re-asked rather than held for the full term.
const PartialRatingsCacheTTL = 10 * time.Minute

// AbsentRatingsCacheTTL is how long an answer carrying no ratings stands. Most
// titles genuinely have no score on most sources, and re-asking for an absence
// on every render is what fills the pacing queue. Short because no absence has
// ever been stored, so there is nothing to argue a longer term from, and an
// absence that later becomes a rating is the case that costs a reader a badge.
const AbsentRatingsCacheTTL = 30 * time.Minute

// ratingsAnswerFreshness is how recently a source must have produced ratings for
// a content type before an absence from it is believed. It bounds the damage of
// a scrape breaking: absences are trusted for at most this long past the
// source's last real answer, whatever term they were stored for.
const ratingsAnswerFreshness = 15 * time.Minute

// ratingsRefreshAheadFrac is how much of an entry's term is spent in its refresh
// window. Inside it a render is served the remembered answer and a fetch runs
// behind it, so the next render does not wait on the source. A fraction rather
// than a duration because the term is configurable.
const ratingsRefreshAheadFrac = 0.1

// ratingsRefreshTimeout bounds a refresh nobody is waiting on.
const ratingsRefreshTimeout = 30 * time.Second

// ratingsCacheMax bounds the number of remembered answers. An answer is one
// source for one title, so the title coverage is this divided by the number of
// sources a config asks for: 3.63 on 2026-08-27, counted over the 73,988 answers
// then resident, giving room for about 110,000 titles at 400,000.
//
// The bound is 400,000 because the age rule's mean multiplier is 2.71 across
// resident entries, which projects 253,569 against a base population of 93,631
// measured 2026-09-03.
//
// Recount before relying on it. The figure moves with which sources configs ask
// for, and the ratio is what turns this bound into a title count.
const ratingsCacheMax = 400_000

// ratingsCache remembers what a source said about a title.
//
// A render is cached under its whole config, but ratings depend only on the
// title, so the same title under two configs used to cost two fetches of the
// same data. Several of these sources meter by the request and one of them
// meters by the day, which makes the duplicate fetch the expensive kind of
// waste. Concurrent misses for one key share a single fetch, so a catalogue
// opening on twenty copies of a title still asks once.
type ratingsCache struct {
	ttl time.Duration
	// path is where the remembered answers are kept across restarts. The render
	// cache is already two-tier; this one was memory-only, so every restart threw
	// away a quarter of a day of metered lookups and paid for them again. Empty
	// disables persistence.
	path string

	logger *slog.Logger

	// answering reports whether a source has produced ratings for a content type
	// within the given window. Nil means absences are never remembered, which is
	// the behaviour before this existed.
	answering func(source, contentType string, within time.Duration) bool

	mu       sync.Mutex
	entries  map[string]ratingsEntry
	inflight map[string]*ratingsCall
}

// storable reports whether an answer is worth remembering. An answer carrying
// ratings always is. An empty one is only worth remembering while the source is
// demonstrably producing ratings for this content type: a broken scrape answers
// empty for everything, and remembering that would pin its outage.
func (c *ratingsCache) storable(key string, meta *provider.MediaMeta) bool {
	if meta == nil {
		return false
	}
	if len(meta.Ratings) > 0 {
		return true
	}
	if c.answering == nil {
		return false
	}
	source, contentType, _ := provider.SplitGoodKey(key)
	return c.answering(source, contentType, ratingsAnswerFreshness)
}

// trusted reports whether a live entry may still be served. A remembered
// absence is re-checked against the source's current state, so the exposure
// after a scrape breaks is how long it takes to notice rather than the term the
// entry was written for.
func (c *ratingsCache) trusted(key string, e ratingsEntry) bool {
	if e.Meta == nil || len(e.Meta.Ratings) > 0 {
		return true
	}
	return c.storable(key, e.Meta)
}

func (c *ratingsCache) log() *slog.Logger {
	if c == nil || c.logger == nil {
		return slog.Default()
	}
	return c.logger
}

type ratingsEntry struct {
	Meta      *provider.MediaMeta `json:"meta"`
	ExpiresAt time.Time           `json:"expiresAt"`
	// TTL is the term this entry was stored for. The age rule and the partial
	// rule both move it away from the cache's base, and the refresh-ahead window
	// is a fraction of the entry's own term rather than the base's. Absent on an
	// entry written before this field, which reads as the base.
	TTL time.Duration `json:"ttl,omitempty"`
}

type ratingsCall struct {
	done     chan struct{}
	meta     *provider.MediaMeta
	complete bool
	err      error
}

func newRatingsCache(ttl time.Duration, logger *slog.Logger) *ratingsCache {
	if ttl <= 0 {
		ttl = DefaultRatingsCacheTTL
	}
	return &ratingsCache{
		ttl:      ttl,
		logger:   logger,
		entries:  make(map[string]ratingsEntry),
		inflight: make(map[string]*ratingsCall),
	}
}

// do returns the remembered answer for key, or runs fetch to produce one.
// Only successful answers carrying ratings are remembered: a failure is the
// case the health tracker's fallback exists for, and caching an empty answer
// would hold a source's outage past its end.
//
// fetch reports whether the answer is complete. An incomplete one is still
// remembered, because re-asking on every render is what exhausts the allowance
// in the first place, but it takes the shorter term.
func (c *ratingsCache) do(ctx context.Context, key string, age titleAge, fetch ratingsFetch) (*provider.MediaMeta, error) {
	if c == nil {
		meta, _, err := fetch(ctx)
		return meta, err
	}

	c.mu.Lock()
	if e, ok := c.entries[key]; ok && time.Now().Before(e.ExpiresAt) && c.trusted(key, e) {
		c.refreshAheadLocked(ctx, key, e, age, fetch)
		c.mu.Unlock()
		return e.Meta, nil
	}
	if call, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		select {
		case <-call.done:
			return call.meta, call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &ratingsCall{done: make(chan struct{})}
	c.inflight[key] = call
	c.mu.Unlock()

	call.meta, call.complete, call.err = fetch(ctx)

	c.mu.Lock()
	delete(c.inflight, key)
	if call.err == nil && c.storable(key, call.meta) {
		c.storeLocked(key, call.meta, call.complete, age)
	}
	c.mu.Unlock()

	close(call.done)
	return call.meta, call.err
}

// ratingsFetch asks a source for a title. It takes a context because a refresh
// runs after the request that triggered it has gone, and cannot use that
// request's.
type ratingsFetch func(context.Context) (*provider.MediaMeta, bool, error)

// refreshAheadLocked starts a fetch behind a still-valid entry that is close to
// expiring. Called with c.mu held.
//
// The refresh takes the caller's context values and not its cancellation: the
// render that triggered it returns immediately, and a refresh on that context
// would be cancelled before it reached the source.
func (c *ratingsCache) refreshAheadLocked(ctx context.Context, key string, e ratingsEntry, age titleAge, fetch ratingsFetch) {
	term := e.TTL
	if term <= 0 {
		term = c.ttl
	}
	window := time.Duration(float64(term) * ratingsRefreshAheadFrac)
	if window <= 0 || time.Until(e.ExpiresAt) > window {
		return
	}
	if _, running := c.inflight[key]; running {
		return
	}
	call := &ratingsCall{done: make(chan struct{})}
	c.inflight[key] = call
	go c.runRefresh(ctx, key, age, call, fetch)
}

func (c *ratingsCache) runRefresh(ctx context.Context, key string, age titleAge, call *ratingsCall, fetch ratingsFetch) {
	defer close(call.done)
	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), ratingsRefreshTimeout)
	defer cancel()

	call.meta, call.complete, call.err = fetch(rctx)
	// A refresh runs off the render path, so its refusal reaches no hold-out
	// line and no counter. Unlogged it is spend and contention with no trace.
	if call.err != nil {
		source, contentType, id := provider.SplitGoodKey(key)
		c.log().WarnContext(rctx, "A ratings refresh did not answer; the remembered answer still stands",
			"triggered_by", logging.RequestID(rctx), "source", source,
			"content_type", contentType, "media_id", id,
			"gate", provider.HoldOutGate(call.err),
			"outcome", outcomeRefreshHeldOut,
			"caller_class", provider.CallerClassFrom(rctx).String(),
			"error", call.err)
	}

	c.mu.Lock()
	delete(c.inflight, key)
	if call.err == nil && c.storable(key, call.meta) {
		c.storeLocked(key, call.meta, call.complete, age)
	}
	c.mu.Unlock()
}

// ratingsAgeTTLTiers scale the term by how long ago a title came out, oldest
// first. A score moves most in the months after release and barely at all years
// later, so the answer that changes least is kept longest and the most
// expensive part of a render is paid for less often.
//
// The multipliers are deliberately small. This cache is clock-bound rather than
// full, so resident entries scale with the term. Entry-weighted across the
// resident population on 2026-09-03, 78.1 percent fall in the 3x tier and the
// mean multiplier is 2.71, projecting 253,569 resident against a 400,000 cap. A
// larger ceiling makes the cache capacity-bound and evicts the answers the rule
// just decided to keep.
//
// Eviction takes the entries closest to expiry, which are the 1x tier, so cap
// pressure falls on the newest titles.
//
// The unit is the year because a rating source reports a year and not a date.
var ratingsAgeTTLTiers = []struct {
	olderThanYears int
	multiplier     int
}{
	{olderThanYears: 3, multiplier: 3},
	{olderThanYears: 1, multiplier: 2},
}

// titleAge is what the store decision knows about when a title came out. The
// date is preferred and the year is the fallback, because most sources report
// only a year.
type titleAge struct {
	year int
	date string
}

// ageScaledTTL returns the term for an answer about a title released on date, in
// YYYY-MM-DD form, falling back to year when there is no date. Year zero takes
// the base term, as does a release in the future.
//
// A whole-year age moves a December release into the next tier on 1 January,
// thirteen days after it came out, which is when a score is still moving.
func ageScaledTTL(base time.Duration, age titleAge) time.Duration {
	if years, ok := yearsSince(age.date); ok {
		return termFor(base, years)
	}
	if age.year <= 0 {
		return base
	}
	return termFor(base, time.Now().Year()-age.year)
}

// yearsSince is whole years elapsed since date. Not ok when the date is absent
// or unparseable, so the caller falls back to the year.
func yearsSince(date string) (int, bool) {
	if len(date) < 10 {
		return 0, false
	}
	t, err := time.Parse("2006-01-02", date[:10])
	if err != nil {
		return 0, false
	}
	now := time.Now()
	age := now.Year() - t.Year()
	if now.YearDay() < t.YearDay() {
		age--
	}
	return age, true
}

func termFor(base time.Duration, age int) time.Duration {
	for _, tier := range ratingsAgeTTLTiers {
		if age >= tier.olderThanYears {
			return base * time.Duration(tier.multiplier)
		}
	}
	return base
}

// storeLocked remembers an answer. Called with c.mu held.
//
// The age comes from the artwork metadata; the rating answer it is backfilled
// from usually carries no year. Measured on production 2026-09-04: of the
// 72,628 entries recording a term, 81.3% took a scaled one.
func (c *ratingsCache) storeLocked(key string, meta *provider.MediaMeta, complete bool, age titleAge) {
	if len(c.entries) >= ratingsCacheMax {
		c.evictLocked()
	}
	if age.year <= 0 && meta != nil {
		age.year = meta.Year
	}
	if age.date == "" && meta != nil {
		age.date = meta.ReleaseDate
	}
	// The age rule decides how long a full answer is worth keeping; the partial
	// rule decides that a thin one is not. The thin case wins, so an answer
	// missing a source because an allowance ran out is re-asked in minutes
	// rather than pinned for days by the title being old.
	ttl := ageScaledTTL(c.ttl, age)
	if !complete && PartialRatingsCacheTTL < ttl {
		ttl = PartialRatingsCacheTTL
	}
	// An absence carries no sources, so the partial rule cannot see it and the
	// age rule would give the newest titles the longest term. Absences skew
	// towards new titles, so both are wrong for it.
	if meta == nil || len(meta.Ratings) == 0 {
		ttl = AbsentRatingsCacheTTL
	} else if prev, ok := c.entries[key]; ok && prev.Meta != nil && len(prev.Meta.Ratings) == 0 {
		// The term for an absence has to come from somewhere, and nothing has
		// ever stored one. This line is that measurement.
		source, contentType, id := provider.SplitGoodKey(key)
		c.log().Info("A remembered absence turned into a rating",
			"source", source, "content_type", contentType, "media_id", id,
			"absent_for_ms", time.Since(prev.ExpiresAt.Add(-prev.TTL)).Milliseconds(),
			"term_ms", prev.TTL.Milliseconds())
	}
	c.entries[key] = ratingsEntry{Meta: meta, ExpiresAt: time.Now().Add(ttl), TTL: ttl}
}

// Len reports how many answers are held, for the admin surface.
func (c *ratingsCache) Len() int {
	if c == nil {
		return 0
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

// evictLocked makes room at the cap. Expired entries go first; if that is not
// enough, the entries closest to expiry go next. Dropping the whole map instead
// meant crossing the cap refetched every title still in use, in one burst,
// against sources that meter by the request.
func (c *ratingsCache) evictLocked() {
	now := time.Now()
	for k, e := range c.entries {
		if now.After(e.ExpiresAt) {
			delete(c.entries, k)
		}
	}
	if len(c.entries) < ratingsCacheMax {
		return
	}
	type aged struct {
		key string
		at  time.Time
	}
	all := make([]aged, 0, len(c.entries))
	for k, e := range c.entries {
		all = append(all, aged{k, e.ExpiresAt})
	}
	sort.Slice(all, func(i, j int) bool { return all[i].at.Before(all[j].at) })
	// Absences take AbsentRatingsCacheTTL against a base term in hours, so they
	// are always nearest expiry and always evicted first. At the cap, absence
	// caching stops rather than degrades.
	//
	// A tenth at a time, so the cap is not hit again on the very next write.
	for i := 0; i < len(all)/10+1; i++ {
		delete(c.entries, all[i].key)
	}
}

// ratingsCacheFile is the name the snapshot takes inside the cache directory.
const ratingsCacheFile = "ratings-cache.json"

// ratingsCacheShape versions the stored MediaMeta shape itself. Bump it only
// when a field a render reads is added or removed, because every remembered
// answer is discarded when it moves.
// (2: added Awards and Stinger. 3: awards win/nominate parser fix.
// 4: MDBList TMDB and Metacritic user scale fix.
// 5: MDBList metacriticuser source key was being dropped.)
//
// Per-source reading changes live in ratingsSourceShape below, not here. A file
// written before that existed carries no source versions, so it reads as 0 and
// only the sources that have since moved are dropped.
const ratingsCacheShape = 5

// ratingsSourceShape versions how one source's answer is read. A parser fix
// touches one source, so bumping its number discards that source's entries and
// leaves every other source's alone. Before this, fixing MDBList's Metacritic
// spelling threw away IMDb, Trakt and Cinemeta too, and each full repopulation
// is paid for against the source that meters by the day.
//
// A source absent from this map is version 0 and is never invalidated here.
var ratingsSourceShape = map[string]int{
	// 1: TMDB and Metacritic user read on the wrong scale, and the
	// metacriticuser key was dropped entirely.
	"mdblist": 1,
	// 1: the display string was not kept, so the badge drew N/A; and the
	// Rotten Tomatoes average of rated reviews was taken where the tomatometer
	// belongs. A remembered answer carries both faults.
	"wikidata": 1,
}

// ratingsSnapshot is the on-disk form: the shape version, the per-source
// versions the entries were written under, and the entries.
type ratingsSnapshot struct {
	Shape        int                     `json:"shape"`
	SourceShapes map[string]int          `json:"sourceShapes,omitempty"`
	Entries      map[string]ratingsEntry `json:"entries"`
}

// sourceOfRatingsKey reads the source back off a cache key, which
// provider.GoodKey builds as "source|mediaType|id".
func sourceOfRatingsKey(key string) string {
	if i := strings.IndexByte(key, '|'); i > 0 {
		return key[:i]
	}
	return ""
}

// load reads a previous snapshot, discarding anything already expired. A
// missing or unreadable file is not an error: the cache simply starts empty.
func (c *ratingsCache) load(logger *slog.Logger) {
	if c == nil || c.path == "" {
		return
	}
	if logger == nil {
		logger = c.log()
	}
	data, err := os.ReadFile(c.path)
	if err != nil {
		return
	}
	var snap ratingsSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		logger.Warn("Could not read the remembered ratings; starting empty",
			"path", c.path, "error", err)
		return
	}
	if snap.Shape != ratingsCacheShape {
		// A different shape means the entries were fetched by code that read a
		// different MediaMeta; discard them rather than serve titles with a new
		// field silently empty.
		logger.Info("Discarded remembered ratings from an older shape",
			"stored_shape", snap.Shape, "current_shape", ratingsCacheShape)
		return
	}
	now := time.Now()
	stale := 0
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, e := range snap.Entries {
		if e.Meta == nil || !now.Before(e.ExpiresAt) {
			continue
		}
		// Only the sources whose reading changed are dropped; the rest of the
		// file is still good and re-fetching it costs a metered lookup.
		src := sourceOfRatingsKey(k)
		if snap.SourceShapes[src] != ratingsSourceShape[src] {
			stale++
			continue
		}
		c.entries[k] = e
	}
	logger.Info("Restored remembered ratings from disk",
		"kept", len(c.entries), "stored", len(snap.Entries), "dropped_stale_source", stale)
}

// Save writes the unexpired answers so a restart does not refetch them. It is
// called on a timer and at shutdown, and writes through a temporary file so a
// kill mid-write cannot leave a corrupt snapshot behind.
func (c *ratingsCache) Save() error {
	if c == nil || c.path == "" {
		return nil
	}
	now := time.Now()
	c.mu.Lock()
	live := make(map[string]ratingsEntry, len(c.entries))
	for k, e := range c.entries {
		if !now.Before(e.ExpiresAt) {
			continue
		}
		// A restart starts with no health state, so a loaded absence could not
		// be believed on arrival anyway.
		if e.Meta == nil || len(e.Meta.Ratings) == 0 {
			continue
		}
		live[k] = e
	}
	c.mu.Unlock()

	data, err := json.Marshal(ratingsSnapshot{
		Shape: ratingsCacheShape, SourceShapes: ratingsSourceShape, Entries: live,
	})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(c.path), 0o755); err != nil {
		return err
	}
	tmp := c.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, c.path)
}

// SetRatingsCachePath points the ratings cache at a file and loads whatever is
// already there.
func (p *Pipeline) SetRatingsCachePath(dir string, logger *slog.Logger) {
	if p.ratings == nil || dir == "" {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	p.ratings.path = filepath.Join(dir, ratingsCacheFile)
	p.ratings.load(logger)
}

// SaveRatingsCache writes the remembered answers to disk.
func (p *Pipeline) SaveRatingsCache() error { return p.ratings.Save() }
