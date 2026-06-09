package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const fanartMoviesURL = "https://webservice.fanart.tv/v3/movies/"
const fanartTVURL     = "https://webservice.fanart.tv/v3/tv/"

// Fanart is the Fanart.tv metadata provider.
// It returns high-quality logos, posters, and art images.
type Fanart struct {
	apiKey     string
	httpClient *http.Client
}

// NewFanart creates a Fanart.tv provider.
func NewFanart(apiKey string) *Fanart {
	return &Fanart{
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (f *Fanart) Name() string { return "fanart" }

// Fetch retrieves Fanart.tv artwork for a media item.
// id must be a TMDB numeric ID for movies, or a TVDB numeric ID for TV.
// IMDb tt-IDs are not supported by Fanart.tv directly.
func (f *Fanart) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	if f.apiKey == "" {
		return nil, fmt.Errorf("fanart: no api key configured")
	}
	if strings.HasPrefix(id, "tt") {
		return nil, fmt.Errorf("fanart: IMDb IDs not directly supported, use TMDB ID")
	}

	isTV := mediaType == "tv" || mediaType == "backdrop" || mediaType == "thumbnail"
	base := fanartMoviesURL
	if isTV {
		base = fanartTVURL
	}

	url := base + id + "?api_key=" + f.apiKey
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("fanart: build request: %w", err)
	}

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fanart: http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("fanart: media not found for id %q", id)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fanart: http %d", resp.StatusCode)
	}

	// Fanart.tv has different shapes for movies vs TV.
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("fanart: decode response: %w", err)
	}

	meta := &MediaMeta{}

	// Extract poster, backdrop (art), and logo — pick the first English or any available.
	meta.PosterURL = bestFanartURL(raw, "movieposter", "tvposter")
	meta.BackdropURL = bestFanartURL(raw, "moviebackground", "showbackground")
	meta.LogoURL = bestFanartURL(raw, "hdmovielogo", "hdtvlogo", "movielogo", "clearlogo")

	if meta.PosterURL == "" && meta.BackdropURL == "" && meta.LogoURL == "" {
		return nil, fmt.Errorf("fanart: no artwork found for id %q", id)
	}

	return meta, nil
}

type fanartImage struct {
	URL  string `json:"url"`
	Lang string `json:"lang"`
	ID   string `json:"id"`
}

// bestFanartURL picks the best URL from the given image type keys.
// Prefers English ("en") images, then falls back to first available.
func bestFanartURL(raw map[string]json.RawMessage, keys ...string) string {
	for _, key := range keys {
		data, ok := raw[key]
		if !ok {
			continue
		}
		var images []fanartImage
		if err := json.Unmarshal(data, &images); err != nil || len(images) == 0 {
			continue
		}
		// Prefer English
		for _, img := range images {
			if img.Lang == "en" && img.URL != "" {
				return img.URL
			}
		}
		// Fall back to first with a URL
		for _, img := range images {
			if img.URL != "" {
				return img.URL
			}
		}
	}
	return ""
}
