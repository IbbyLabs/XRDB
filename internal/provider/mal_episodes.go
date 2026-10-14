package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"xrdb_rewrite/internal/provider/animemap"
)

// Jikan lists an entry's episodes 100 to a page, each with MAL's score on a
// five-point scale. One page answers one episode, so a page is the unit cached.

const (
	malEpisodePageSize = 100
	// malEpisodesFresh bounds a page that may still change: an episode aired
	// recently, or one that aired lately and has no score yet.
	malEpisodesFresh = 6 * time.Hour
	// malEpisodesSettled bounds a page whose episodes are all past.
	malEpisodesSettled = 7 * 24 * time.Hour
	// malEpisodesRecent is how long after airing an episode's page stays fresh.
	malEpisodesRecent = 14 * 24 * time.Hour
	// malEpisodesUnscored is how long an aired episode without a score is
	// expected to gain one.
	malEpisodesUnscored = 90 * 24 * time.Hour
	malEpisodePageCap   = 1000
)

// EpisodeMapper maps a TMDB season and episode of a series onto a MAL entry.
type EpisodeMapper interface {
	EpisodeEntry(seriesKey string, season, episode int) (animemap.EpisodeEntry, animemap.EpisodeRefusal)
}

// AnimeEpisodeHint names the MAL entry and the episode inside it that a request
// asked for by anime id, ahead of any mapping from TMDB numbering.
type AnimeEpisodeHint struct {
	MALID   int
	Episode int
}

type animeEpisodeHintKey struct{}

type episodeNameKey struct{}

// WithEpisodeName returns a context carrying the episode's name on TMDB, which
// the mapped MAL episode is checked against.
func WithEpisodeName(ctx context.Context, name string) context.Context {
	return context.WithValue(ctx, episodeNameKey{}, name)
}

func episodeNameFrom(ctx context.Context) string {
	n, _ := ctx.Value(episodeNameKey{}).(string)
	return n
}

// WithAnimeEpisodeHint returns a context carrying the entry a request named.
func WithAnimeEpisodeHint(ctx context.Context, h AnimeEpisodeHint) context.Context {
	return context.WithValue(ctx, animeEpisodeHintKey{}, h)
}

func animeEpisodeHintFrom(ctx context.Context) (AnimeEpisodeHint, bool) {
	h, ok := ctx.Value(animeEpisodeHintKey{}).(AnimeEpisodeHint)
	return h, ok && h.MALID > 0 && h.Episode > 0
}

type jikanEpisode struct {
	Title        string   `json:"title"`
	TitleRomanji string   `json:"title_romanji"`
	MalID        int      `json:"mal_id"`
	Aired        string   `json:"aired"`
	Score        *float64 `json:"score"`
}

type malEpisodePage struct {
	episodes []jikanEpisode
	// total is the entry's episode count as Jikan reports it, 0 when absent.
	total   int
	expires time.Time
}

type malPageCall struct {
	done chan struct{}
	val  *malEpisodePage
	err  error
}

// MALEpisodes supplies MyAnimeList's per-episode score. It shares the MAL
// provider's client, and so its pacer, but is a source of its own: the series
// score is asked about the series and this one about the episode.
type MALEpisodes struct {
	mal    *MAL
	mapper EpisodeMapper
	now    func() time.Time

	mu       sync.Mutex
	pages    map[string]*malEpisodePage
	inflight map[string]*malPageCall
	// refused remembers the (series, season) pairs whose chain failed, so each
	// is logged once.
	refused sync.Map
}

// NewMALEpisodes wraps mal, which supplies the HTTP client and Jikan base URL.
func NewMALEpisodes(mal *MAL, mapper EpisodeMapper) *MALEpisodes {
	return &MALEpisodes{
		mal:      mal,
		mapper:   mapper,
		now:      time.Now,
		pages:    map[string]*malEpisodePage{},
		inflight: map[string]*malPageCall{},
	}
}

func (m *MALEpisodes) Name() string { return "malep" }

// RatingSources declares MAL: the episode score is drawn as the MAL rating, so
// the provider is wanted whenever MAL is selected.
func (m *MALEpisodes) RatingSources() []string { return []string{"mal"} }

// Fetch refuses: an episode score is looked up by series and numbers.
func (m *MALEpisodes) Fetch(_ context.Context, _, id string) (*MediaMeta, error) {
	return nil, fmt.Errorf("malep: %q names no episode: %w", id, ErrNotApplicable)
}

// AppliesTo reports whether id names an episode that maps onto a MAL entry. A
// title with nothing to ask is not a source the render lost.
func (m *MALEpisodes) AppliesTo(ctx context.Context, _, id string) bool {
	series, season, episode, ok := splitEpisodeID(id)
	if !ok {
		return false
	}
	_, err := m.entryFor(ctx, series, season, episode)
	return err == nil
}

var malSeriesPrefixes = []string{"tmdb:", "series:", "tv:"}

// episodeSeriesKey turns a series id into the key the anime map files seasons
// under: an IMDb id as is, a TMDB id as "tv:<id>". Anything else, a TVDB id
// included, is empty.
func episodeSeriesKey(series string) string {
	s := strings.ToLower(strings.TrimSpace(series))
	if traktIMDbIDRe.MatchString(s) {
		return s
	}
	for stripped := true; stripped; {
		stripped = false
		for _, p := range malSeriesPrefixes {
			if rest, ok := strings.CutPrefix(s, p); ok {
				s, stripped = rest, true
			}
		}
	}
	if n, err := strconv.Atoi(s); err != nil || n <= 0 {
		return ""
	}
	return "tv:" + s
}

var episodeIDRe = regexp.MustCompile(`^(.+):(\d+):(\d+)$`)

func splitEpisodeID(id string) (series string, season, episode int, ok bool) {
	g := episodeIDRe.FindStringSubmatch(id)
	if g == nil {
		return "", 0, 0, false
	}
	season, _ = strconv.Atoi(g[2])
	episode, _ = strconv.Atoi(g[3])
	return g[1], season, episode, episode >= 1
}

// entryFor settles which MAL entry and episode a request means: the one it
// named by anime id, else the one TMDB's numbering maps to.
func (m *MALEpisodes) entryFor(ctx context.Context, series string, season, episode int) (animemap.EpisodeEntry, error) {
	if h, ok := animeEpisodeHintFrom(ctx); ok {
		return animemap.EpisodeEntry{MALID: h.MALID, Episode: h.Episode}, nil
	}
	if m.mapper == nil {
		return animemap.EpisodeEntry{}, fmt.Errorf("malep: no anime map: %w", ErrNotApplicable)
	}
	key := episodeSeriesKey(series)
	if key == "" {
		return animemap.EpisodeEntry{}, fmt.Errorf("malep: series %q has no TMDB or IMDb key: %w", series, ErrNotApplicable)
	}
	entry, refusal := m.mapper.EpisodeEntry(key, season, episode)
	if refusal != animemap.EpisodeResolved {
		return animemap.EpisodeEntry{}, fmt.Errorf("malep: season %d episode %d of %s is not mapped (%s): %w", season, episode, series, refusal, ErrNotApplicable)
	}
	return entry, nil
}

// placed confirms the mapped MAL episode is the one asked for. The titles
// decide where both sides have one; otherwise the entry must start where the one
// before it ends.
func (m *MALEpisodes) placed(ctx context.Context, series string, season int, e animemap.EpisodeEntry, jk *jikanEpisode) (bool, error) {
	name := episodeNameFrom(ctx)
	if genericTitle(name) || jk == nil || (genericTitle(jk.Title) && genericTitle(jk.TitleRomanji)) {
		return m.chainHolds(ctx, series, season, e)
	}
	if titlesMatch(name, jk.Title) || titlesMatch(name, jk.TitleRomanji) {
		return true, nil
	}
	m.noteBrokenChain(ctx, series, season, "the titles differ", e,
		"tmdb_title", normalizeTitle(name), "mal_title", normalizeTitle(jk.Title), "mal_title_romanji", normalizeTitle(jk.TitleRomanji))
	return false, nil
}

// chainHolds checks that a mapped entry starts where the one before it ends. A
// dataset offset one episode out would otherwise score the wrong episode, and a
// wrong score is worse than none. An entry at the start of its season has
// nothing to check.
func (m *MALEpisodes) chainHolds(ctx context.Context, series string, season int, e animemap.EpisodeEntry) (bool, error) {
	if e.Offset == 0 {
		return true, nil
	}
	if !e.HasPrev {
		m.noteBrokenChain(ctx, series, season, "no entry before it in the season", e)
		return false, nil
	}
	prev, err := m.page(ctx, e.PrevMALID, 1)
	if err != nil {
		return false, err
	}
	if prev.total == 0 || e.PrevOffset+prev.total != e.Offset {
		m.noteBrokenChain(ctx, series, season, "the entry before it does not end where it starts", e, "previous_total", prev.total)
		return false, nil
	}
	return true, nil
}

func (m *MALEpisodes) noteBrokenChain(ctx context.Context, series string, season int, why string, e animemap.EpisodeEntry, extra ...any) {
	if _, seen := m.refused.LoadOrStore(fmt.Sprintf("%s/%d", series, season), true); seen {
		return
	}
	attrs := append([]any{"series", series, "season", season, "mal_id", e.MALID, "offset", e.Offset,
		"previous_mal_id", e.PrevMALID, "previous_offset", e.PrevOffset}, extra...)
	slog.Default().DebugContext(ctx, "Refused an episode score because the season's MAL entries do not line up: "+why, attrs...)
}

// FetchEpisodeRating answers with the episode's MAL score, read from the one
// page of its entry's episode list that holds it.
func (m *MALEpisodes) FetchEpisodeRating(ctx context.Context, series string, season, episode int, _ string) (*MediaMeta, error) {
	entry, err := m.entryFor(ctx, series, season, episode)
	if err != nil {
		return nil, err
	}
	malID, malEp := entry.MALID, entry.Episode
	page := (malEp-1)/malEpisodePageSize + 1
	pg, err := m.page(ctx, malID, page)
	if err != nil {
		return nil, err
	}
	if pg.total > 0 && malEp > pg.total {
		return nil, fmt.Errorf("malep: MAL %d has %d episodes, not %d: %w", malID, pg.total, malEp, errNotFound)
	}
	if _, hinted := animeEpisodeHintFrom(ctx); !hinted {
		var jk *jikanEpisode
		for i := range pg.episodes {
			if pg.episodes[i].MalID == malEp {
				jk = &pg.episodes[i]
			}
		}
		if ok, err := m.placed(ctx, series, season, entry, jk); err != nil {
			return nil, err
		} else if !ok {
			return nil, fmt.Errorf("malep: season %d episode %d of %s is not MAL %d episode %d: %w", season, episode, series, malID, malEp, errNotFound)
		}
	}
	for _, e := range pg.episodes {
		if e.MalID != malEp {
			continue
		}
		if e.Score == nil || *e.Score <= 0 {
			break
		}
		return &MediaMeta{Ratings: []Rating{{
			Source:       "malep",
			Value:        *e.Score * 2,
			Label:        fmt.Sprintf("%.2f", *e.Score),
			NativeSuffix: "/5",
		}}}, nil
	}
	return nil, fmt.Errorf("malep: no score for MAL %d episode %d: %w", malID, malEp, errNotFound)
}

// page returns one page of an entry's episode list, one request however many
// renders ask at once. A bulk caller is served from memory only.
func (m *MALEpisodes) page(ctx context.Context, malID, page int) (*malEpisodePage, error) {
	key := fmt.Sprintf("%d/%d", malID, page)
	m.mu.Lock()
	if p, ok := m.pages[key]; ok && m.now().Before(p.expires) {
		m.mu.Unlock()
		return p, nil
	}
	if TreatedAsBulk(CallerClassFrom(ctx)) {
		m.mu.Unlock()
		return nil, fmt.Errorf("malep: episode page %s is not cached and a bulk caller may not fetch it: %w", key, ErrBulkAllowanceHeld)
	}
	if call, ok := m.inflight[key]; ok {
		m.mu.Unlock()
		select {
		case <-call.done:
			return call.val, call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &malPageCall{done: make(chan struct{})}
	m.inflight[key] = call
	m.mu.Unlock()

	pg, err := m.fetchPage(ctx, malID, page)
	call.val, call.err = pg, err
	m.mu.Lock()
	delete(m.inflight, key)
	if err == nil {
		m.storeLocked(key, pg)
	}
	m.mu.Unlock()
	close(call.done)
	return pg, err
}

func (m *MALEpisodes) storeLocked(key string, pg *malEpisodePage) {
	if len(m.pages) >= malEpisodePageCap {
		now := m.now()
		for k, p := range m.pages {
			if !now.Before(p.expires) {
				delete(m.pages, k)
			}
		}
		if len(m.pages) >= malEpisodePageCap {
			m.pages = map[string]*malEpisodePage{}
		}
	}
	m.pages[key] = pg
}

func (m *MALEpisodes) fetchPage(ctx context.Context, malID, page int) (*malEpisodePage, error) {
	base := m.mal.baseURL
	if base == "" {
		base = jikanBaseURL
	}
	url := fmt.Sprintf("%s%d/episodes?page=%d", base, malID, page)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("malep: build request: %w", err)
	}
	resp, err := m.mal.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("malep: http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusGatewayTimeout && perTitleGatewayError(resp) {
		return nil, fmt.Errorf("malep: http %d for MAL %d: %w", resp.StatusCode, malID, ErrUpstreamUnavailable)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, HTTPFault("malep", resp.StatusCode)
	}
	var body struct {
		Pagination struct {
			Items struct {
				Total int `json:"total"`
			} `json:"items"`
		} `json:"pagination"`
		Data []jikanEpisode `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("malep: decode: %w", err)
	}
	return &malEpisodePage{episodes: body.Data, total: body.Pagination.Items.Total, expires: m.now().Add(malPageTerm(body.Data, m.now()))}, nil
}

// malPageTerm is short while a page may still change and long once it is settled.
func malPageTerm(eps []jikanEpisode, now time.Time) time.Duration {
	for _, e := range eps {
		aired, err := time.Parse(time.RFC3339, e.Aired)
		if err != nil {
			continue
		}
		age := now.Sub(aired)
		if age < malEpisodesRecent {
			return malEpisodesFresh
		}
		if (e.Score == nil || *e.Score <= 0) && age < malEpisodesUnscored {
			return malEpisodesFresh
		}
	}
	return malEpisodesSettled
}
