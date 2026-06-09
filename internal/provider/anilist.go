package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const anilistGraphQLURL = "https://graphql.anilist.co"

// AniList is the AniList.co GraphQL metadata provider (no auth required for public queries).
// IDs must be prefixed with "al:" e.g. "al:21".
type AniList struct {
	httpClient *http.Client
}

// NewAniList creates an AniList provider. No API key is required.
func NewAniList() *AniList {
	return &AniList{
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (a *AniList) Name() string { return "anilist" }

const anilistQuery = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    title { english romaji native }
    description(asHtml: false)
    coverImage { extraLarge large }
    bannerImage
    averageScore
    genres
    startDate { year }
    contentAdvisoryRating: isAdult
  }
}`

// Fetch retrieves AniList metadata. id must be prefixed "al:<numeric-id>".
func (a *AniList) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	alID, ok := stripPrefix(id, "al:")
	if !ok {
		return nil, fmt.Errorf("anilist: unsupported id %q (expected al:<id>)", id)
	}

	// Parse the numeric ID for the GraphQL variable.
	numericID, err := strconv.Atoi(alID)
	if err != nil {
		return nil, fmt.Errorf("anilist: invalid numeric id in %q", id)
	}

	payload := map[string]any{
		"query":     anilistQuery,
		"variables": map[string]any{"id": numericID},
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("anilist: build payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, anilistGraphQLURL,
		bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("anilist: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("anilist: http post: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anilist: http %d", resp.StatusCode)
	}

	var result struct {
		Data struct {
			Media struct {
				Title struct {
					English string `json:"english"`
					Romaji  string `json:"romaji"`
					Native  string `json:"native"`
				} `json:"title"`
				Description  string  `json:"description"`
				AverageScore int     `json:"averageScore"` // 0-100
				Genres       []string `json:"genres"`
				CoverImage   struct {
					ExtraLarge string `json:"extraLarge"`
					Large      string `json:"large"`
				} `json:"coverImage"`
				BannerImage string `json:"bannerImage"`
				StartDate   struct {
					Year int `json:"year"`
				} `json:"startDate"`
			} `json:"Media"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("anilist: decode: %w", err)
	}
	if len(result.Errors) > 0 {
		return nil, fmt.Errorf("anilist: API error: %s", result.Errors[0].Message)
	}

	m := result.Data.Media
	title := m.Title.English
	if title == "" {
		title = m.Title.Romaji
	}
	if title == "" {
		title = m.Title.Native
	}

	// Strip HTML tags from description (AniList sometimes returns <br> etc.)
	overview := stripHTMLTags(m.Description)

	meta := &MediaMeta{
		Title:    title,
		Year:     m.StartDate.Year,
		Overview: overview,
		Language: "en",
		Genres:   m.Genres,
	}

	if m.CoverImage.ExtraLarge != "" {
		meta.PosterURL = m.CoverImage.ExtraLarge
	} else if m.CoverImage.Large != "" {
		meta.PosterURL = m.CoverImage.Large
	}
	if m.BannerImage != "" {
		meta.BackdropURL = m.BannerImage
	}

	if m.AverageScore > 0 {
		normalized := float64(m.AverageScore) / 10.0
		meta.Ratings = []Rating{{
			Source: "anilist",
			Value:  normalized,
			Label:  fmt.Sprintf("%.1f", normalized),
		}}
	}

	return meta, nil
}

// stripHTMLTags removes basic HTML tags from s.
func stripHTMLTags(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}
