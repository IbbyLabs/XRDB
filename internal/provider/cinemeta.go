package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const cinemetaBaseURL = "https://v3-cinemeta.strem.io"
const metahubImageBase = "https://images.metahub.space"

// Cinemeta is the Stremio Cinemeta metadata/artwork provider.
// It serves Stremio's canonical artwork (via metahub) and requires no API key.
// Only IMDb tt-IDs are supported.
type Cinemeta struct {
	baseURL    string
	httpClient *http.Client
}

// NewCinemeta creates a Cinemeta provider.
func NewCinemeta() *Cinemeta {
	return &Cinemeta{
		baseURL:    cinemetaBaseURL,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// NewCinemetaWithBaseURL creates a Cinemeta provider against a custom base URL (for testing).
func NewCinemetaWithBaseURL(base string) *Cinemeta {
	return &Cinemeta{
		baseURL:    base,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Cinemeta) Name() string { return "cinemeta" }

// Fetch retrieves Cinemeta metadata for an IMDb tt-ID.
func (c *Cinemeta) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	return c.FetchArtwork(ctx, mediaType, id, ArtworkOptions{})
}

// FetchArtwork retrieves Cinemeta metadata, honoring the size preference for
// metahub image URLs (small/medium/large variants).
func (c *Cinemeta) FetchArtwork(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error) {
	if !strings.HasPrefix(id, "tt") {
		return nil, fmt.Errorf("cinemeta: only IMDb tt-IDs supported, got %q", id)
	}

	// Cinemeta needs a content type; the render media type doesn't tell us
	// whether the title is a movie or a series, so try movie first.
	meta, err := c.fetchMeta(ctx, "movie", id)
	if err != nil {
		meta, err = c.fetchMeta(ctx, "series", id)
	}
	if err != nil {
		return nil, err
	}

	size := "medium"
	switch opts.Size {
	case "large", "4k":
		size = "large"
	}
	// Prefer metahub URLs at the requested size; Cinemeta's own poster field
	// is a metahub medium URL, so rebuilding keeps sizes consistent.
	meta.PosterURL = metahubImageBase + "/poster/" + size + "/" + id + "/img"
	meta.BackdropURL = metahubImageBase + "/background/" + size + "/" + id + "/img"
	meta.LogoURL = metahubImageBase + "/logo/medium/" + id + "/img"

	return meta, nil
}

func (c *Cinemeta) fetchMeta(ctx context.Context, contentType, id string) (*MediaMeta, error) {
	url := c.baseURL + "/meta/" + contentType + "/" + id + ".json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("cinemeta: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("cinemeta: http %d for %s", resp.StatusCode, url)
	}

	var result struct {
		Meta struct {
			Name        string   `json:"name"`
			ReleaseInfo string   `json:"releaseInfo"`
			Description string   `json:"description"`
			IMDbRating  string   `json:"imdbRating"`
			Genres      []string `json:"genres"`
			Poster      string   `json:"poster"`
			Background  string   `json:"background"`
			Logo        string   `json:"logo"`
		} `json:"meta"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("cinemeta: decode: %w", err)
	}
	m := result.Meta
	if m.Name == "" && m.Poster == "" {
		return nil, fmt.Errorf("cinemeta: empty meta for %s", id)
	}

	meta := &MediaMeta{
		Title:       m.Name,
		Overview:    m.Description,
		PosterURL:   m.Poster,
		BackdropURL: m.Background,
		LogoURL:     m.Logo,
		Genres:      m.Genres,
		Language:    "en",
	}
	if len(m.ReleaseInfo) >= 4 {
		meta.Year, _ = strconv.Atoi(m.ReleaseInfo[:4])
	}
	if r, err := strconv.ParseFloat(m.IMDbRating, 64); err == nil && r > 0 {
		meta.Ratings = []Rating{{
			Source: "imdb",
			Value:  r,
			Label:  m.IMDbRating,
		}}
	}
	return meta, nil
}
