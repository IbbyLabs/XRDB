package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"time"
)

const traktBaseURL = "https://api.trakt.tv"

var traktIMDbIDRe = regexp.MustCompile(`^tt\d+$`)

// Trakt is the Trakt.tv ratings provider.
// Requires a Trakt Client-ID (OAuth app or V2 API key).
// Accepts IMDb IDs (tt-prefixed) and returns a Trakt community rating.
type Trakt struct {
	clientID   string
	httpClient *http.Client
}

// NewTrakt creates a Trakt provider with the given Client-ID.
func NewTrakt(clientID string) *Trakt {
	return &Trakt{
		clientID:   clientID,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (t *Trakt) Name() string { return "trakt" }

// Fetch retrieves Trakt ratings. id must be an IMDb tt-prefixed ID (e.g. "tt0468569").
func (t *Trakt) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	if !traktIMDbIDRe.MatchString(id) {
		return nil, fmt.Errorf("trakt: unsupported id %q (expected tt<imdb-id>)", id)
	}

	// Determine Trakt path segment from mediaType.
	segment := "movies"
	if mediaType == "show" || mediaType == "tv" || mediaType == "series" {
		segment = "shows"
	}

	url := fmt.Sprintf("%s/%s/%s/ratings", traktBaseURL, segment, id)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("trakt: build request: %w", err)
	}
	req.Header.Set("trakt-api-key", t.clientID)
	req.Header.Set("trakt-api-version", "2")
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("trakt: http get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("trakt: not found for id %q", id)
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
