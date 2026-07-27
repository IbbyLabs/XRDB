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
	// held for the life of the process.
	idCache map[string]string
}

// simklIDCacheMax bounds the id cache. Reached in practice only by a library
// far larger than one process serves.
const simklIDCacheMax = 50_000

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
			return nil, fmt.Errorf("simkl: empty id in %q", id)
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

// fetchSegment queries one SIMKL segment ("movies" or "tv"). origID is the
// caller's original ID, used only for error messages. It returns a wrapped
// errNotFound on a 404 so Fetch can retry the other segment.
func (s *SIMKL) fetchSegment(ctx context.Context, segment, simklID, origID string) (*MediaMeta, error) {
	base := simklBaseURL
	if s.baseURL != "" {
		base = s.baseURL
	}
	u := fmt.Sprintf("%s/%s/%s?client_id=%s&extended=full",
		base, segment, simklID, url.QueryEscape(s.cred(ctx)))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
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
		return nil, fmt.Errorf("simkl: http %d", resp.StatusCode)
	}

	var result struct {
		Title  string `json:"title"`
		Year   int    `json:"year"`
		Genres []struct {
			Genre string `json:"genre"`
		} `json:"genres"`
		Ratings struct {
			Simkl struct {
				Rating float64 `json:"rating"` // 0–100
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
		// SIMKL ratings are 0–100; normalize to 0–10.
		normalized := sr.Rating / 10.0
		meta.Ratings = []Rating{{
			Source: "simkl",
			Value:  normalized,
			Label:  fmt.Sprintf("%.1f", normalized),
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
	id, err := s.fetchIDByIMDB(ctx, imdbID)
	if err != nil {
		return "", err
	}
	s.rememberID(imdbID, id)
	return id, nil
}

// cachedID returns a remembered SIMKL id for an IMDb id.
func (s *SIMKL) cachedID(imdbID string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	id, ok := s.idCache[imdbID]
	return id, ok
}

// rememberID stores a mapping, clearing the cache wholesale once it grows past
// its bound. The mapping is stable, so the only reason to drop entries is size.
func (s *SIMKL) rememberID(imdbID, simklID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.idCache == nil {
		s.idCache = make(map[string]string, simklIDCacheMax)
	}
	if len(s.idCache) >= simklIDCacheMax {
		s.idCache = make(map[string]string, simklIDCacheMax)
	}
	s.idCache[imdbID] = simklID
}

func (s *SIMKL) fetchIDByIMDB(ctx context.Context, imdbID string) (string, error) {
	base := simklBaseURL
	if s.baseURL != "" {
		base = s.baseURL
	}
	u := fmt.Sprintf("%s/search/id?client_id=%s&imdb=%s",
		base, url.QueryEscape(s.cred(ctx)), imdbID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
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
		return "", fmt.Errorf("simkl: no match for imdb id %q", imdbID)
	}

	return fmt.Sprintf("%d", results[0].IDs.Simkl), nil
}
