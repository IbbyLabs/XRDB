package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const simklBaseURL = "https://api.simkl.com"

var simklIMDbIDRe = regexp.MustCompile(`^tt\d+$`)

// SIMKL is the Simkl.com ratings and metadata provider.
// Requires a SIMKL Client-ID.
// Accepts SIMKL-prefixed IDs (e.g. "simkl:2012") or IMDb tt-prefixed IDs
// (via SIMKL's ID lookup). When given an IMDb ID, an extra lookup call is made.
type SIMKL struct {
	clientID   string
	httpClient *http.Client
}

// NewSIMKL creates a SIMKL provider with the given Client-ID.
func NewSIMKL(clientID string) *SIMKL {
	return &SIMKL{
		clientID:   clientID,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (s *SIMKL) Name() string { return "simkl" }

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

	segment := "movies"
	if mediaType == "show" || mediaType == "tv" || mediaType == "series" {
		segment = "tv"
	}

	u := fmt.Sprintf("%s/%s/%s?client_id=%s&extended=full",
		simklBaseURL, segment, simklID, url.QueryEscape(s.clientID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("simkl: build request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("simkl: http get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("simkl: not found for id %q", id)
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

// lookupByIMDB resolves an IMDb ID to a SIMKL numeric ID.
func (s *SIMKL) lookupByIMDB(ctx context.Context, imdbID string) (string, error) {
	u := fmt.Sprintf("%s/search/id?client_id=%s&imdb=%s",
		simklBaseURL, url.QueryEscape(s.clientID), imdbID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", fmt.Errorf("simkl lookup: build request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("simkl lookup: http get: %w", err)
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
