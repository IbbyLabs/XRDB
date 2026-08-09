package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var simklNumericIDRe = regexp.MustCompile(`^\d+$`)

const simklBaseURL = "https://api.simkl.com"

var simklIMDbIDRe = regexp.MustCompile(`^tt\d+$`)

// SIMKL is the Simkl.com ratings and metadata provider.
// Requires a SIMKL Client-ID.
// Accepts SIMKL-prefixed IDs (e.g. "simkl:2012") or IMDb tt-prefixed IDs
// (via SIMKL's ID lookup). When given an IMDb ID, an extra lookup call is made.
type SIMKL struct {
	mu         sync.RWMutex
	clientID   string
	baseURL    string // overrides simklBaseURL; set in tests
	httpClient *http.Client
	// idCache maps an IMDb id to its SIMKL id. The mapping is fixed, so it is
	// kept across restarts; see simkl_idcache.go.
	// store is the backing database. The in-memory maps below are gone: an id
	// map that only grows must not be held whole in a 768 MB process.
	store       *simklIDStore
	idCachePath string
	// nowFn is swapped in tests so no test waits on a real clock.
	nowFn func() time.Time

	idHits     atomic.Int64
	idSearches atomic.Int64
	idNoMatch  atomic.Int64
}

// simklIDMissTTL is how long a title SIMKL has no entry for is left alone. A
// miss re-searched on every render never settles, and a sweep walks exactly the
// obscure and newly-released titles the source is least likely to carry. A day
// bounds how long a title added upstream stays invisible here.
const simklIDMissTTL = 24 * time.Hour

// Requests carry the application name, its version and a user agent alongside
// the client id.
const simklAppName = "xrdb"

var simklAppVersion atomic.Pointer[string]

// SetSIMKLAppVersion records the running version for SIMKL's app-version
// parameter and user agent.
func SetSIMKLAppVersion(v string) {
	v = strings.TrimSpace(v)
	if v == "" {
		return
	}
	simklAppVersion.Store(&v)
}

func simklVersion() string {
	if p := simklAppVersion.Load(); p != nil {
		return *p
	}
	return "0"
}

// simklAppParams are appended to every SIMKL URL.
func simklAppParams() string {
	return "&app-name=" + simklAppName + "&app-version=" + url.QueryEscape(simklVersion())
}

// simklRequest builds a SIMKL request carrying the user agent they asked for.
func simklRequest(ctx context.Context, u string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "XRDB/"+simklVersion())
	return req, nil
}

// UpdateCredentials swaps the live credential so a value saved in the UI takes
// effect without a restart.
func (s *SIMKL) UpdateCredentials(clientID string) {
	s.mu.Lock()
	s.clientID = clientID
	s.mu.Unlock()
}

// HasCredentials reports whether the provider can make authenticated requests.
func (s *SIMKL) HasCredentials() bool {
	return s.cred(context.Background()) != ""
}

func (s *SIMKL) cred(ctx context.Context) string {
	// An owner-supplied credential stands in for the server's for this render.
	if k := keyFrom(ctx, KeySIMKL); k != "" {
		return k
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.clientID
}

// NewSIMKL creates a SIMKL provider with the given Client-ID.
func NewSIMKL(clientID string) *SIMKL {
	return &SIMKL{
		clientID:   clientID,
		httpClient: newHTTPClient("simkl", 10*time.Second),
		// Replaced by the on-disk store once a cache directory is set.
		store: openMemorySIMKLIDStore(),
	}
}

func (s *SIMKL) Name() string { return "simkl" }

// RatingSources lists the rating this provider can supply, so a render that
// selected none of them skips the call.
func (s *SIMKL) RatingSources() []string { return []string{"simkl"} }

// Fetch retrieves SIMKL ratings.
// id may be "simkl:<numeric-id>" or a tt-prefixed IMDb ID for automatic lookup.
func (s *SIMKL) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	var simklID string

	switch {
	case strings.HasPrefix(id, "simkl:"):
		raw, ok := stripPrefix(id, "simkl:")
		if !ok {
			return nil, fmt.Errorf("simkl: empty id in %q: %w", id, ErrNotApplicable)
		}
		if !simklNumericIDRe.MatchString(raw) {
			return nil, fmt.Errorf("simkl: non-numeric id %q", id)
		}
		simklID = raw

	case simklIMDbIDRe.MatchString(id):
		// Lookup SIMKL ID via IMDb ID.
		var err error
		simklID, err = s.lookupByIMDB(ctx, id)
		if err != nil {
			return nil, err
		}

	default:
		return nil, fmt.Errorf("simkl: unsupported id %q (expected simkl:<id> or tt<imdb-id>)", id)
	}

	// SIMKL serves movies and TV from distinct segments, but the artwork surface
	// doesn't disambiguate. Try the type implied by the content-type hint first,
	// then fall back to the other on a not-found rather than dropping the rating.
	primary, secondary := "movies", "tv"
	if isSeriesType(mediaType) {
		primary, secondary = "tv", "movies"
	}
	meta, err := s.fetchSegment(ctx, primary, simklID, id)
	if errors.Is(err, errNotFound) {
		meta, err = s.fetchSegment(ctx, secondary, simklID, id)
	}
	return meta, err
}

// simklGenre reads either shape SIMKL uses for a genre: an object {"genre":"X"}
// or a bare string "X". Typing it as one or the other failed the whole decode on
// the shape it did not expect, which dropped the ratings with it.
type simklGenre struct{ Genre string }

func (g *simklGenre) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		g.Genre = s
		return nil
	}
	var obj struct {
		Genre string `json:"genre"`
	}
	if err := json.Unmarshal(b, &obj); err != nil {
		return err
	}
	g.Genre = obj.Genre
	return nil
}

// fetchSegment queries one SIMKL segment ("movies" or "tv"). origID is the
// caller's original ID, used only for error messages. It returns a wrapped
// errNotFound on a 404 so Fetch can retry the other segment.
func (s *SIMKL) fetchSegment(ctx context.Context, segment, simklID, origID string) (*MediaMeta, error) {
	base := simklBaseURL
	if s.baseURL != "" {
		base = s.baseURL
	}
	// extended=full is not sent: SIMKL's CDN copy already carries every field
	// parsed here, and the parameter only creates a second cache key for it.
	u := fmt.Sprintf("%s/%s/%s?client_id=%s%s",
		base, segment, simklID, url.QueryEscape(s.cred(ctx)), simklAppParams())
	req, err := simklRequest(ctx, u)
	if err != nil {
		return nil, fmt.Errorf("simkl: build request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("simkl: http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("simkl: %s not found for %q: %w", segment, origID, errNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, HTTPFault("simkl", resp.StatusCode)
	}

	var result struct {
		Title   string       `json:"title"`
		Year    int          `json:"year"`
		Genres  []simklGenre `json:"genres"`
		Ratings struct {
			Simkl struct {
				Rating float64 `json:"rating"` // 0–10, like the imdb rating beside it
				Votes  int     `json:"votes"`
			} `json:"simkl"`
		} `json:"ratings"`
		Posters struct {
			Po string `json:"po"` // poster key, full URL: https://wsrv.nl/?url=simkl.in/posters/{po}_m.jpg
		} `json:"posters"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("simkl: decode: %w", err)
	}

	meta := &MediaMeta{
		Title: result.Title,
		Year:  result.Year,
	}

	if len(result.Genres) > 0 {
		genres := make([]string, 0, len(result.Genres))
		for _, g := range result.Genres {
			if g.Genre != "" {
				genres = append(genres, g.Genre)
			}
		}
		meta.Genres = genres
	}

	if result.Posters.Po != "" {
		meta.PosterURL = "https://wsrv.nl/?url=simkl.in/posters/" + result.Posters.Po + "_m.jpg"
	}

	sr := result.Ratings.Simkl
	if sr.Rating > 0 && sr.Votes > 0 {
		// Already 0–10, alongside an imdb rating on the same scale in the same
		// object. It was being divided by ten on the belief that it was 0–100,
		// which rendered every SIMKL score under 1.
		meta.Ratings = []Rating{{
			Source: "simkl",
			Value:  sr.Rating,
			Label:  fmt.Sprintf("%.1f", sr.Rating),
		}}
	}

	return meta, nil
}

// lookupByIMDB resolves an IMDb ID to a SIMKL numeric ID. A title's SIMKL id
// never changes, so resolving it once spares the second of the two requests
// every rating fetch would otherwise cost against a daily allowance.
func (s *SIMKL) lookupByIMDB(ctx context.Context, imdbID string) (string, error) {
	if id, ok := s.cachedID(imdbID); ok {
		return id, nil
	}
	if s.recentlyMissed(imdbID) {
		return "", fmt.Errorf("simkl: no match for imdb id %q: %w", imdbID, errNotFound)
	}
	id, err := s.fetchIDByIMDB(ctx, imdbID)
	if err != nil {
		return "", err
	}
	s.rememberID(imdbID, id)
	return id, nil
}

// now reports the current time, or the test clock when one is set.
func (s *SIMKL) now() time.Time {
	if s.nowFn != nil {
		return s.nowFn()
	}
	return time.Now()
}

// recentlyMissed reports whether SIMKL has already said it has no entry for a
// title, recently enough to take its word for it.
func (s *SIMKL) recentlyMissed(imdbID string) bool {
	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()
	if !store.missedRecently(imdbID, s.now()) {
		return false
	}
	s.idNoMatch.Add(1)
	return true
}

// rememberMiss records that SIMKL has no entry for a title.
func (s *SIMKL) rememberMiss(imdbID string) {
	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()
	store.rememberMiss(imdbID, s.now())
}

// cachedID returns a remembered SIMKL id for an IMDb id.
func (s *SIMKL) cachedID(imdbID string) (string, bool) {
	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()
	id, ok := store.lookup(imdbID)
	if ok {
		s.idHits.Add(1)
	}
	return id, ok
}

// rememberID stores a mapping. Nothing evicts: an id never changes, the row is
// a few dozen bytes, and the store is on disk rather than in the heap.
func (s *SIMKL) rememberID(imdbID, simklID string) {
	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()
	store.remember(imdbID, simklID)
}

func (s *SIMKL) fetchIDByIMDB(ctx context.Context, imdbID string) (string, error) {
	s.idSearches.Add(1)
	base := simklBaseURL
	if s.baseURL != "" {
		base = s.baseURL
	}
	u := fmt.Sprintf("%s/search/id?client_id=%s&imdb=%s%s",
		base, url.QueryEscape(s.cred(ctx)), imdbID, simklAppParams())
	req, err := simklRequest(ctx, u)
	if err != nil {
		return "", fmt.Errorf("simkl lookup: build request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("simkl lookup: http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("simkl lookup: http %d for imdb id %q", resp.StatusCode, imdbID)
	}

	var results []struct {
		IDs struct {
			Simkl int `json:"simkl"`
		} `json:"ids"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return "", fmt.Errorf("simkl lookup: decode: %w", err)
	}
	if len(results) == 0 || results[0].IDs.Simkl == 0 {
		s.rememberMiss(imdbID)
		return "", fmt.Errorf("simkl: no match for imdb id %q: %w", imdbID, errNotFound)
	}

	return fmt.Sprintf("%d", results[0].IDs.Simkl), nil
}
