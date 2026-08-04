package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const omdbBaseURL = "https://www.omdbapi.com/"

// OMDB is the Open Movie Database metadata provider.
// It returns Rotten Tomatoes and Metacritic ratings for movies and TV.
type OMDB struct {
	mu         sync.RWMutex
	apiKey     string
	httpClient *http.Client
	baseURL    string // overrides omdbBaseURL; used in tests
}

// UpdateCredentials swaps the live credential so a value saved in the UI takes
// effect without a restart.
func (o *OMDB) UpdateCredentials(apiKey string) {
	o.mu.Lock()
	o.apiKey = apiKey
	o.mu.Unlock()
}

// HasCredentials reports whether the provider can make authenticated requests.
func (o *OMDB) HasCredentials() bool {
	return o.cred(context.Background()) != ""
}

func (o *OMDB) cred(ctx context.Context) string {
	// An owner-supplied credential stands in for the server's for this render.
	if k := keyFrom(ctx, KeyOMDB); k != "" {
		return k
	}
	o.mu.RLock()
	defer o.mu.RUnlock()
	return o.apiKey
}

// NewOMDB creates an OMDB provider.
func NewOMDB(apiKey string) *OMDB {
	return &OMDB{
		apiKey:     apiKey,
		httpClient: newHTTPClient("omdb", 10*time.Second),
	}
}

func (o *OMDB) Name() string { return "omdb" }

// RatingSources lists the ratings this provider can supply, so a render that
// selected none of them skips the call.
func (o *OMDB) RatingSources() []string { return []string{"imdb", "rt", "metacritic"} }

// Fetch retrieves OMDB ratings for a media item.
// Only IMDb tt-IDs are supported; numeric IDs are not resolved.
func (o *OMDB) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	if o.cred(ctx) == "" {
		return nil, fmt.Errorf("omdb: no api key configured")
	}
	if !strings.HasPrefix(id, "tt") {
		return nil, fmt.Errorf("omdb: only IMDb tt-IDs are supported, got %q: %w", id, ErrNotApplicable)
	}

	base := omdbBaseURL
	if o.baseURL != "" {
		base = o.baseURL
	}
	params := url.Values{"i": {id}, "tomatoes": {"true"}, "apikey": {o.cred(ctx)}}
	reqURL := base + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("omdb: build request: %w", err)
	}
	resp, err := o.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("omdb: http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("omdb: http %d", resp.StatusCode)
	}

	var result struct {
		Response string `json:"Response"` // "True" or "False"
		Error    string `json:"Error,omitempty"`
		Poster   string `json:"Poster"` // absolute URL, or "N/A" when absent
		Ratings  []struct {
			Source string `json:"Source"`
			Value  string `json:"Value"`
		} `json:"Ratings"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("omdb: decode response: %w", err)
	}
	if result.Response != "True" {
		if strings.Contains(result.Error, "Incorrect IMDb ID") || strings.Contains(result.Error, "not found") {
			// OMDb answering "I do not have this title" is about the title, not
			// about OMDb. Counting it holds the source out for every render.
			return nil, fmt.Errorf("omdb: API error: %s: %w", result.Error, errNotFound)
		}
		return nil, fmt.Errorf("omdb: API error: %s", result.Error)
	}

	meta := &MediaMeta{}
	meta.PosterURL = omdbPosterURL(result.Poster)
	for _, r := range result.Ratings {
		switch r.Source {
		case "Rotten Tomatoes":
			if pct := parsePercent(r.Value); pct >= 0 {
				meta.Ratings = append(meta.Ratings, Rating{
					Source: "rt",
					Value:  pct,
					Label:  r.Value,
				})
			}
		case "Metacritic":
			if n := parseSlashScore(r.Value); n >= 0 {
				meta.Ratings = append(meta.Ratings, Rating{
					Source: "metacritic",
					Value:  n,       // parseSlashScore already returns 0-10 scale
					Label:  r.Value, // preserve original display string e.g. "74/100"
				})
			}
		case "Internet Movie Database":
			if score := parseSlashScore(r.Value); score >= 0 {
				meta.Ratings = append(meta.Ratings, Rating{
					Source: "imdb",
					Value:  score,
					Label:  fmt.Sprintf("%.1f", score),
				})
			}
		}
	}
	if len(meta.Ratings) == 0 {
		return nil, fmt.Errorf("omdb: no ratings found for %s: %w", id, errNotFound)
	}
	return meta, nil
}

// parsePercent parses "XX%" → float64 (0-10 scale). Returns -1 on failure.
func parsePercent(s string) float64 {
	s = strings.TrimSuffix(strings.TrimSpace(s), "%")
	n, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return -1
	}
	return n / 10.0 // normalize 0-100 to 0-10
}

// parseSlashScore parses "8.4/10" or "74/100" → float64 on a 0-10 scale.
// Returns -1 on failure.
func parseSlashScore(s string) float64 {
	parts := strings.SplitN(strings.TrimSpace(s), "/", 2)
	if len(parts) != 2 {
		return -1
	}
	num, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	if err != nil {
		return -1
	}
	denom, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err != nil || denom == 0 {
		return -1
	}
	return num / denom * 10
}

// omdbPosterURL returns the poster URL from an OMDB response, or "" when there
// is none: OMDB reports a missing poster as the literal "N/A".
func omdbPosterURL(v string) string {
	if u := strings.TrimSpace(v); strings.HasPrefix(u, "http") {
		return u
	}
	return ""
}
