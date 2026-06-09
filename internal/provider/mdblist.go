package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const mdblistBase = "https://api.mdblist.com"

// MDBList is the MDBList metadata provider.
// It accepts an IMDb tt-prefixed ID and returns ratings from multiple sources
// (IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Trakt, and MDBList's own aggregate).
type MDBList struct {
	apiKey     string
	httpClient *http.Client
}

// NewMDBList creates an MDBList provider.
func NewMDBList(apiKey string) *MDBList {
	return &MDBList{
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (m *MDBList) Name() string { return "mdblist" }

// Fetch retrieves multi-provider ratings from MDBList for the given IMDB tt-ID.
// Returns an error (not a fatal failure) when the ID is not an IMDb tt-ID.
func (m *MDBList) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	if m.apiKey == "" {
		return nil, fmt.Errorf("mdblist: no api key configured")
	}
	if !strings.HasPrefix(id, "tt") {
		return nil, fmt.Errorf("mdblist: requires imdb tt-id, got %q", id)
	}

	mdbType := "movie"
	if mediaType == "tv" || mediaType == "series" || mediaType == "backdrop" {
		mdbType = "show"
	}

	url := fmt.Sprintf("%s/imdb/%s/%s?apikey=%s", mdblistBase, mdbType, id, m.apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mdblist: request: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusTooManyRequests:
		return nil, fmt.Errorf("mdblist: rate limited")
	case http.StatusUnauthorized, http.StatusForbidden:
		return nil, fmt.Errorf("mdblist: unauthorized (check api key)")
	case http.StatusNotFound:
		return nil, fmt.Errorf("mdblist: not found for %q", id)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mdblist: http %d", resp.StatusCode)
	}

	var payload mdblistPayload
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("mdblist: decode response: %w", err)
	}

	return &MediaMeta{
		Ratings: parseMDBListRatings(payload),
	}, nil
}

type mdblistPayload struct {
	Score   float64          `json:"score"`
	Ratings []mdblistRating  `json:"ratings"`
}

type mdblistRating struct {
	Source string  `json:"source"`
	Value  float64 `json:"value"`
	Score  float64 `json:"score"`
	Votes  int     `json:"votes"`
}

func parseMDBListRatings(p mdblistPayload) []Rating {
	seen := make(map[string]bool)
	var out []Rating

	for _, r := range p.Ratings {
		source := normalizeMDBSource(r.Source)
		if source == "" || seen[source] {
			continue
		}
		v := r.Value
		if v == 0 {
			v = r.Score
		}
		if v == 0 {
			continue
		}
		normalized, label := mdblistNormalize(source, v)
		if normalized <= 0 {
			continue
		}
		seen[source] = true
		out = append(out, Rating{
			Source: source,
			Value:  normalized,
			Votes:  r.Votes,
			Label:  label,
		})
	}

	// MDBList aggregate score
	if p.Score > 0 && !seen["mdblist"] {
		out = append(out, Rating{
			Source: "mdblist",
			Value:  p.Score / 10,
			Label:  fmt.Sprintf("%.0f", p.Score),
		})
	}

	return out
}

// normalizeMDBSource maps MDBList source strings to canonical source identifiers.
func normalizeMDBSource(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "imdb":
		return "imdb"
	case "tomatoes":
		return "rt"
	case "tomatoes_audience":
		return "rtaudience"
	case "metacritic":
		return "metacritic"
	case "metacritic_user":
		return "metacriticuser"
	case "letterboxd":
		return "letterboxd"
	case "mdblist":
		return "mdblist"
	case "trakt":
		return "trakt"
	case "tmdb":
		return "tmdb"
	case "rogerebert":
		return "rogerebert"
	case "commonsense":
		return "commonsense"
	case "myanimelist", "mal":
		return "mal"
	case "anilist":
		return "anilist"
	}
	return ""
}

// mdblistNormalize converts a raw MDBList value to a 0-10 normalized float and
// a display label appropriate for that provider.
func mdblistNormalize(source string, value float64) (float64, string) {
	switch source {
	case "imdb", "tmdb":
		// Already 0–10 scale
		return value, fmt.Sprintf("%.1f", value)
	case "rt", "rtaudience":
		// 0–100 percentage
		return value / 10, fmt.Sprintf("%.0f%%", value)
	case "metacritic", "metacriticuser":
		// 0–100 score
		return value / 10, fmt.Sprintf("%.0f", value)
	case "letterboxd":
		// 0–5 scale → normalise to 0–10
		return value * 2, fmt.Sprintf("%.1f", value)
	case "mdblist", "trakt", "rogerebert", "commonsense":
		// 0–100 aggregate
		return value / 10, fmt.Sprintf("%.0f", value)
	case "mal", "anilist":
		// 0–10 scale
		return value, fmt.Sprintf("%.1f", value)
	default:
		if value > 10 {
			return value / 10, fmt.Sprintf("%.0f", value)
		}
		return value, fmt.Sprintf("%.1f", value)
	}
}
