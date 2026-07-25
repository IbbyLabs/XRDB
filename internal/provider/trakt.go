package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sync"
	"time"
)

const traktBaseURL = "https://api.trakt.tv"

var traktIMDbIDRe = regexp.MustCompile(`^tt\d+$`)

// Trakt is the Trakt.tv ratings provider.
// Requires a Trakt Client-ID (OAuth app or V2 API key).
// Accepts IMDb IDs (tt-prefixed) and returns a Trakt community rating.
type Trakt struct {
	mu         sync.RWMutex
	clientID   string
	baseURL    string // overrides traktBaseURL; set in tests
	httpClient *http.Client
}

// UpdateCredentials swaps the live credential so a value saved in the UI takes
// effect without a restart.
func (t *Trakt) UpdateCredentials(clientID string) {
	t.mu.Lock()
	t.clientID = clientID
	t.mu.Unlock()
}

// HasCredentials reports whether the provider can make authenticated requests.
func (t *Trakt) HasCredentials() bool {
	return t.cred(context.Background()) != ""
}

func (t *Trakt) cred(ctx context.Context) string {
	// An owner-supplied credential stands in for the server's for this render.
	if k := keyFrom(ctx, KeyTrakt); k != "" {
		return k
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.clientID
}

// NewTrakt creates a Trakt provider with the given Client-ID.
func NewTrakt(clientID string) *Trakt {
	return &Trakt{
		clientID:   clientID,
		httpClient: newHTTPClient("trakt", 10*time.Second),
	}
}

func (t *Trakt) Name() string { return "trakt" }

// Fetch retrieves Trakt ratings. id must be an IMDb tt-prefixed ID (e.g. "tt0468569").
func (t *Trakt) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	if !traktIMDbIDRe.MatchString(id) {
		return nil, fmt.Errorf("trakt: unsupported id %q (expected tt<imdb-id>)", id)
	}

	// Trakt serves movies and shows from distinct path segments, but the artwork
	// surface doesn't disambiguate. Try the type implied by the content-type
	// hint first, then fall back to the other on a not-found rather than dropping
	// the rating (the historical series-poster bug).
	primary, secondary := "movies", "shows"
	if isSeriesType(mediaType) {
		primary, secondary = "shows", "movies"
	}
	meta, err := t.fetchSegment(ctx, primary, id)
	if errors.Is(err, errNotFound) {
		meta, err = t.fetchSegment(ctx, secondary, id)
	}
	return meta, err
}

// fetchSegment queries one Trakt segment ("movies" or "shows"). It returns a
// wrapped errNotFound on a 404 so Fetch can retry the other segment.
func (t *Trakt) fetchSegment(ctx context.Context, segment, id string) (*MediaMeta, error) {
	base := traktBaseURL
	if t.baseURL != "" {
		base = t.baseURL
	}
	url := fmt.Sprintf("%s/%s/%s/ratings", base, segment, id)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("trakt: build request: %w", err)
	}
	req.Header.Set("trakt-api-key", t.cred(ctx))
	req.Header.Set("trakt-api-version", "2")
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("trakt: http get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("trakt: %s not found for id %q: %w", segment, id, errNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("trakt: http %d", resp.StatusCode)
	}

	var result struct {
		Rating float64 `json:"rating"` // 0–10
		Votes  int     `json:"votes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("trakt: decode: %w", err)
	}
	if result.Rating <= 0 || result.Votes == 0 {
		return nil, fmt.Errorf("trakt: no rating data for id %q", id)
	}

	return &MediaMeta{
		Ratings: []Rating{{
			Source: "trakt",
			Value:  result.Rating,
			Label:  fmt.Sprintf("%.1f", result.Rating),
		}},
	}, nil
}
