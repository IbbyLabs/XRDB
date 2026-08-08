package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Jikan is the public unofficial MyAnimeList REST API (no auth required).
const jikanBaseURL = "https://api.jikan.moe/v4/anime/"

// MAL is the MyAnimeList metadata provider via the Jikan public API.
// IDs must be prefixed with "mal:" e.g. "mal:20".
type MAL struct {
	httpClient *http.Client
	baseURL    string // overridable for tests; defaults to jikanBaseURL
}

// NewMAL creates a MAL provider using the public Jikan API.
func NewMAL() *MAL {
	return NewMALWithURL("")
}

// NewMALWithURL creates a MAL provider with a custom Jikan base URL.
// Pass an empty string to use the default public endpoint.
func NewMALWithURL(baseURL string) *MAL {
	if baseURL == "" {
		baseURL = jikanBaseURL
	}
	return &MAL{
		httpClient: newHTTPClient("mal", 10*time.Second),
		baseURL:    baseURL,
	}
}

// instantRefusal bounds how quickly a gateway error must arrive to be read as a
// statement about one title rather than a gateway timing out. Jikan's per-title
// 504 lands in about 130ms.
const instantRefusal = time.Second

// answeredFast reports whether the source itself answered inside
// instantRefusal. An unmeasured response is treated as slow: a gateway that
// genuinely times out must still count against the source.
func answeredFast(resp *http.Response) bool {
	ms, err := strconv.ParseInt(resp.Header.Get(upstreamMsHeader), 10, 64)
	if err != nil {
		return false
	}
	return time.Duration(ms)*time.Millisecond < instantRefusal
}

// JikanHost names the Jikan instance a base URL points at, or the public one
// when the override is empty. Host only, never the path or query.
func JikanHost(baseURL string) string {
	if baseURL == "" {
		baseURL = jikanBaseURL
	}
	u, err := url.Parse(baseURL)
	if err != nil || u.Host == "" {
		return "unparseable"
	}
	return u.Host
}

func (m *MAL) Name() string { return "mal" }

// RatingSources lists the rating this provider can supply, so a render that
// selected none of them skips the call.
func (m *MAL) RatingSources() []string { return []string{"mal"} }

// Fetch retrieves MAL metadata. id must be prefixed "mal:<numeric-id>".
func (m *MAL) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	malID, ok := stripPrefix(id, "mal:")
	if !ok {
		return nil, fmt.Errorf("mal: unsupported id %q (expected mal:<id>)", id)
	}

	base := m.baseURL
	if base == "" {
		base = jikanBaseURL
	}
	url := base + malID
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("mal: build request: %w", err)
	}
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mal: http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("mal: anime not found for id %q: %w", id, ErrNotApplicable)
	}
	if resp.StatusCode == http.StatusGatewayTimeout && answeredFast(resp) {
		return nil, fmt.Errorf("mal: http %d for id %q: %w", resp.StatusCode, id, ErrUpstreamUnavailable)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mal: http %d", resp.StatusCode)
	}

	var result struct {
		Data struct {
			TitleEnglish string  `json:"title_english"`
			Title        string  `json:"title"`
			Synopsis     string  `json:"synopsis"`
			Score        float64 `json:"score"`
			Year         int     `json:"year"`
			Genres       []struct {
				Name string `json:"name"`
			} `json:"genres"`
			Images struct {
				JPG struct {
					LargeImageURL string `json:"large_image_url"`
					ImageURL      string `json:"image_url"`
				} `json:"jpg"`
			} `json:"images"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("mal: decode: %w", err)
	}

	d := result.Data
	title := d.TitleEnglish
	lang := "en"
	if title == "" {
		title = d.Title
		lang = "ja"
	}

	meta := &MediaMeta{
		Title:    title,
		Year:     d.Year,
		Overview: d.Synopsis,
		Language: lang,
	}

	posterURL := d.Images.JPG.LargeImageURL
	if posterURL == "" {
		posterURL = d.Images.JPG.ImageURL
	}
	meta.PosterURL = posterURL

	if len(d.Genres) > 0 {
		genres := make([]string, 0, len(d.Genres))
		for _, g := range d.Genres {
			if g.Name != "" {
				genres = append(genres, g.Name)
			}
		}
		meta.Genres = genres
	}

	if d.Score > 0 {
		meta.Ratings = []Rating{{
			Source: "mal",
			Value:  d.Score,
			Label:  fmt.Sprintf("%.1f", d.Score),
		}}
	}

	return meta, nil
}

// stripPrefix returns (suffix, true) if s has the given prefix, else ("", false).
func stripPrefix(s, prefix string) (string, bool) {
	if !strings.HasPrefix(s, prefix) {
		return "", false
	}
	rest := strings.TrimPrefix(s, prefix)
	if rest == "" {
		return "", false
	}
	return rest, true
}
