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

const kitsuBaseURL = "https://kitsu.io/api/edge/anime/"

// Kitsu is the Kitsu.io metadata provider (no auth required for public queries).
// IDs must be prefixed with "kitsu:" e.g. "kitsu:7442".
type Kitsu struct {
	httpClient *http.Client
	baseURL    string // overridable for tests; defaults to kitsuBaseURL
}

// NewKitsu creates a Kitsu provider. No API key is required.
func NewKitsu() *Kitsu {
	return &Kitsu{
		httpClient: newHTTPClient("kitsu", 10*time.Second),
		baseURL:    kitsuBaseURL,
	}
}

func (k *Kitsu) Name() string { return "kitsu" }

// RatingSources lists the rating this provider can supply, so a render that
// selected none of them skips the call.
func (k *Kitsu) RatingSources() []string { return []string{"kitsu"} }

// Fetch retrieves Kitsu metadata. id must be prefixed "kitsu:<numeric-id>".
func (k *Kitsu) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	kitsuID, ok := stripPrefix(id, "kitsu:")
	if !ok {
		return nil, fmt.Errorf("kitsu: unsupported id %q (expected kitsu:<id>)", id)
	}

	base := k.baseURL
	if base == "" {
		base = kitsuBaseURL
	}
	url := base + kitsuID
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("kitsu: build request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.api+json")

	resp, err := k.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("kitsu: http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("kitsu: anime not found for id %q", id)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kitsu: http %d", resp.StatusCode)
	}

	// Kitsu uses JSON:API format.
	var result struct {
		Data struct {
			Attributes struct {
				Titles struct {
					En   string `json:"en"`
					EnJP string `json:"en_jp"`
					JaJP string `json:"ja_jp"`
				} `json:"titles"`
				Synopsis      string `json:"synopsis"`
				AverageRating string `json:"averageRating"` // e.g. "74.72"
				StartDate     string `json:"startDate"`     // e.g. "2007-04-02"
				AgeRating     string `json:"ageRating"`     // e.g. "PG"
				PosterImage   struct {
					Original string `json:"original"`
					Large    string `json:"large"`
					Small    string `json:"small"`
				} `json:"posterImage"`
				CoverImage struct {
					Original string `json:"original"`
					Large    string `json:"large"`
				} `json:"coverImage"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("kitsu: decode: %w", err)
	}

	attr := result.Data.Attributes

	title := attr.Titles.En
	if title == "" {
		title = attr.Titles.EnJP
	}
	if title == "" {
		title = attr.Titles.JaJP
	}

	year := 0
	if len(attr.StartDate) >= 4 {
		year, _ = strconv.Atoi(attr.StartDate[:4])
	}

	meta := &MediaMeta{
		Title:    title,
		Year:     year,
		Overview: attr.Synopsis,
		Language: "en",
	}

	if attr.AgeRating != "" {
		meta.ContentRating = attr.AgeRating
	}

	posterURL := attr.PosterImage.Original
	if posterURL == "" {
		posterURL = attr.PosterImage.Large
	}
	if posterURL == "" {
		posterURL = attr.PosterImage.Small
	}
	meta.PosterURL = posterURL

	backdropURL := attr.CoverImage.Original
	if backdropURL == "" {
		backdropURL = attr.CoverImage.Large
	}
	meta.BackdropURL = backdropURL

	if attr.AverageRating != "" {
		score, err := strconv.ParseFloat(strings.TrimSpace(attr.AverageRating), 64)
		if err == nil && score > 0 {
			normalized := score / 10.0 // 0-100 → 0-10
			meta.Ratings = []Rating{{
				Source: "kitsu",
				Value:  normalized,
				Label:  fmt.Sprintf("%.1f", normalized),
			}}
		}
	}

	return meta, nil
}
