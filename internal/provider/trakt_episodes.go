package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Trakt has no lookup for an episode by its IMDb id: both segments answer 204.
// Its season listing carries every episode's rating, so one call serves a season.

// traktSeasonFresh and traktSeasonSettled bound how long a season's ratings are
// reused: briefly while it is still airing, longer once its last episode is past.
const (
	traktSeasonFresh   = 6 * time.Hour
	traktSeasonSettled = 24 * time.Hour
	traktSeasonAiring  = 365 * 24 * time.Hour
)

type traktEpisode struct {
	Number     int     `json:"number"`
	Rating     float64 `json:"rating"`
	Votes      int     `json:"votes"`
	FirstAired string  `json:"first_aired"`
	IDs        struct {
		IMDb string `json:"imdb"`
	} `json:"ids"`
}

type traktSeason struct {
	episodes []traktEpisode
	expires  time.Time
}

type traktSeasonCall struct {
	done chan struct{}
	val  *traktSeason
	err  error
}

type traktEpisodeCache struct {
	mu       sync.Mutex
	seasons  map[string]*traktSeason
	inflight map[string]*traktSeasonCall
	shows    map[string]string // tmdb id -> trakt id
}

func newTraktEpisodeCache() *traktEpisodeCache {
	return &traktEpisodeCache{
		seasons:  map[string]*traktSeason{},
		inflight: map[string]*traktSeasonCall{},
		shows:    map[string]string{},
	}
}

func (t *Trakt) episodeCache() *traktEpisodeCache {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.episodes == nil {
		t.episodes = newTraktEpisodeCache()
	}
	return t.episodes
}

// FetchEpisodeRating answers for one episode from its season's listing, matched
// on the episode's IMDb id where Trakt has it and on the number otherwise.
func (t *Trakt) FetchEpisodeRating(ctx context.Context, series string, season, episode int, tconst string) (*MediaMeta, error) {
	show, err := t.traktShowID(ctx, series)
	if err != nil {
		return nil, err
	}
	s, err := t.traktSeason(ctx, show, season)
	if err != nil {
		return nil, err
	}
	var match *traktEpisode
	for i := range s.episodes {
		e := &s.episodes[i]
		if tconst != "" && e.IDs.IMDb == tconst {
			match = e
			break
		}
		if match == nil && e.Number == episode {
			match = e
		}
	}
	if match == nil || match.Rating <= 0 || match.Votes == 0 {
		return nil, fmt.Errorf("trakt: no rating for %s season %d episode %d: %w", series, season, episode, errNotFound)
	}
	return &MediaMeta{Ratings: []Rating{{
		Source: "trakt",
		Value:  match.Rating,
		Votes:  match.Votes,
		Label:  fmt.Sprintf("%.1f", match.Rating),
	}}}, nil
}

// traktShowID turns a series id into one Trakt's show paths accept: an IMDb id
// as is, a TMDB id through Trakt's id search (remembered).
func (t *Trakt) traktShowID(ctx context.Context, series string) (string, error) {
	if traktIMDbIDRe.MatchString(series) {
		return series, nil
	}
	tmdb := strings.TrimPrefix(series, "tmdb:")
	if tmdb == "" {
		return "", fmt.Errorf("trakt: empty series id: %w", ErrNotApplicable)
	}
	for _, r := range tmdb {
		if r < '0' || r > '9' {
			return "", fmt.Errorf("trakt: series id %q is neither IMDb nor TMDB: %w", series, ErrNotApplicable)
		}
	}
	c := t.episodeCache()
	c.mu.Lock()
	if id, ok := c.shows[tmdb]; ok {
		c.mu.Unlock()
		return id, nil
	}
	c.mu.Unlock()
	var found []struct {
		Show struct {
			IDs struct {
				Trakt int `json:"trakt"`
			} `json:"ids"`
		} `json:"show"`
	}
	if err := t.traktGet(ctx, fmt.Sprintf("/search/tmdb/%s?type=show", tmdb), &found); err != nil {
		return "", err
	}
	if len(found) == 0 || found[0].Show.IDs.Trakt == 0 {
		return "", fmt.Errorf("trakt: no show for TMDB id %s: %w", tmdb, errNotFound)
	}
	id := fmt.Sprint(found[0].Show.IDs.Trakt)
	c.mu.Lock()
	c.shows[tmdb] = id
	c.mu.Unlock()
	return id, nil
}

// traktSeason returns a season's episodes, one request per season however many
// renders ask at once.
func (t *Trakt) traktSeason(ctx context.Context, show string, season int) (*traktSeason, error) {
	key := fmt.Sprintf("%s/%d", show, season)
	c := t.episodeCache()
	c.mu.Lock()
	if s, ok := c.seasons[key]; ok && time.Now().Before(s.expires) {
		c.mu.Unlock()
		return s, nil
	}
	if call, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		select {
		case <-call.done:
			return call.val, call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &traktSeasonCall{done: make(chan struct{})}
	c.inflight[key] = call
	c.mu.Unlock()

	var eps []traktEpisode
	err := t.traktGet(ctx, fmt.Sprintf("/shows/%s/seasons/%d?extended=full", show, season), &eps)
	if err == nil {
		call.val = &traktSeason{episodes: eps, expires: time.Now().Add(seasonTerm(eps))}
	}
	call.err = err
	c.mu.Lock()
	delete(c.inflight, key)
	if err == nil {
		c.seasons[key] = call.val
	}
	c.mu.Unlock()
	close(call.done)
	return call.val, call.err
}

// seasonTerm is short while the season's newest episode is under a year old.
func seasonTerm(eps []traktEpisode) time.Duration {
	var newest time.Time
	for _, e := range eps {
		if at, err := time.Parse(time.RFC3339, e.FirstAired); err == nil && at.After(newest) {
			newest = at
		}
	}
	if newest.IsZero() || time.Since(newest) < traktSeasonAiring {
		return traktSeasonFresh
	}
	return traktSeasonSettled
}

func (t *Trakt) traktGet(ctx context.Context, path string, out any) error {
	base := traktBaseURL
	if t.baseURL != "" {
		base = t.baseURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
	if err != nil {
		return fmt.Errorf("trakt: build request: %w", err)
	}
	req.Header.Set("trakt-api-key", t.cred(ctx))
	req.Header.Set("trakt-api-version", "2")
	req.Header.Set("Content-Type", "application/json")
	resp, err := t.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("trakt: http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusNoContent {
		return fmt.Errorf("trakt: nothing at %s: %w", path, errNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return HTTPFault("trakt", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("trakt: decode: %w", err)
	}
	return nil
}
