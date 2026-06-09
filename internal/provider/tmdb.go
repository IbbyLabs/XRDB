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

const tmdbBaseURL = "https://api.themoviedb.org/3"
const tmdbImageBase = "https://image.tmdb.org/t/p"

// TMDB is the TMDB metadata provider.
type TMDB struct {
	apiKey     string
	readToken  string
	httpClient *http.Client
}

// NewTMDB creates a TMDB provider. Provide either apiKey or readToken (readToken preferred).
func NewTMDB(apiKey, readToken string) *TMDB {
	return &TMDB{
		apiKey:    apiKey,
		readToken: readToken,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (t *TMDB) Name() string { return "tmdb" }

// Fetch retrieves TMDB metadata for a media item.
// mediaType must be "movie" or "tv"; id must be a numeric TMDB ID or an IMDb tt-ID.
func (t *TMDB) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	if t.apiKey == "" && t.readToken == "" {
		return nil, fmt.Errorf("tmdb: no api key or read token configured")
	}
	// resolve IMDb ID → TMDB ID if needed
	tmdbID, resolvedType, err := t.resolveID(ctx, mediaType, id)
	if err != nil {
		return nil, fmt.Errorf("tmdb: resolve id %q: %w", id, err)
	}
	return t.fetchByTMDBID(ctx, resolvedType, tmdbID)
}

func (t *TMDB) resolveID(ctx context.Context, mediaType, id string) (string, string, error) {
	// IMDB tt-IDs need find endpoint to get TMDB ID
	if strings.HasPrefix(id, "tt") {
		path := tmdbBaseURL + "/find/" + id + "?external_source=imdb_id"
		var result struct {
			MovieResults []struct {
				ID int `json:"id"`
			} `json:"movie_results"`
			TVResults []struct {
				ID int `json:"id"`
			} `json:"tv_results"`
		}
		if err := t.get(ctx, path, &result); err != nil {
			return "", "", err
		}
		if len(result.MovieResults) > 0 {
			return strconv.Itoa(result.MovieResults[0].ID), "movie", nil
		}
		if len(result.TVResults) > 0 {
			return strconv.Itoa(result.TVResults[0].ID), "tv", nil
		}
		return "", "", fmt.Errorf("no TMDB match for IMDB id %q", id)
	}
	// Normalize media type
	resolvedType := "movie"
	if mediaType == "tv" || mediaType == "series" || mediaType == "backdrop" {
		resolvedType = "tv"
	}
	return id, resolvedType, nil
}

func (t *TMDB) fetchByTMDBID(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	path := tmdbBaseURL + "/" + mediaType + "/" + id +
		"?append_to_response=images,release_dates,content_ratings,watch%2Fproviders"
	var result struct {
		Title        string  `json:"title"`
		Name         string  `json:"name"` // TV
		Overview     string  `json:"overview"`
		ReleaseDate  string  `json:"release_date"`
		FirstAirDate string  `json:"first_air_date"`
		VoteAverage  float64 `json:"vote_average"`
		VoteCount    int     `json:"vote_count"`
		PosterPath   string  `json:"poster_path"`
		BackdropPath string  `json:"backdrop_path"`
		Genres       []struct {
			Name string `json:"name"`
		} `json:"genres"`
		ReleaseDates struct {
			Results []struct {
				Iso3166 string `json:"iso_3166_1"`
				Dates   []struct {
					Certification string `json:"certification"`
				} `json:"release_dates"`
			} `json:"results"`
		} `json:"release_dates"`
		ContentRatings struct {
			Results []struct {
				Iso3166 string `json:"iso_3166_1"`
				Rating  string `json:"rating"`
			} `json:"results"`
		} `json:"content_ratings"`
		WatchProviders struct {
			Results map[string]struct {
				Flatrate []struct {
					ProviderID   int    `json:"provider_id"`
					ProviderName string `json:"provider_name"`
				} `json:"flatrate"`
				Rent []struct {
					ProviderID   int    `json:"provider_id"`
					ProviderName string `json:"provider_name"`
				} `json:"rent"`
			} `json:"results"`
		} `json:"watch/providers"`
	}
	if err := t.get(ctx, path, &result); err != nil {
		return nil, err
	}

	title := result.Title
	if title == "" {
		title = result.Name
	}
	date := result.ReleaseDate
	if date == "" {
		date = result.FirstAirDate
	}
	year := 0
	if len(date) >= 4 {
		year, _ = strconv.Atoi(date[:4])
	}

	meta := &MediaMeta{
		Title:    title,
		Year:     year,
		Overview: result.Overview,
		Language: "en",
	}
	if result.PosterPath != "" {
		meta.PosterURL = tmdbImageBase + "/w780" + result.PosterPath
	}
	if result.BackdropPath != "" {
		meta.BackdropURL = tmdbImageBase + "/w1280" + result.BackdropPath
	}
	if result.VoteAverage > 0 {
		meta.Ratings = []Rating{{
			Source: "tmdb",
			Value:  result.VoteAverage,
			Votes:  result.VoteCount,
			Label:  fmt.Sprintf("%.1f", result.VoteAverage),
		}}
	}

	// Genres
	if len(result.Genres) > 0 {
		genres := make([]string, 0, len(result.Genres))
		for _, g := range result.Genres {
			if g.Name != "" {
				genres = append(genres, g.Name)
			}
		}
		meta.Genres = genres
	}

	// Content rating — prefer US certification
	for _, r := range result.ReleaseDates.Results {
		if r.Iso3166 == "US" {
			for _, d := range r.Dates {
				if d.Certification != "" {
					meta.ContentRating = d.Certification
					break
				}
			}
			break
		}
	}
	// TV content ratings
	if meta.ContentRating == "" {
		for _, r := range result.ContentRatings.Results {
			if r.Iso3166 == "US" && r.Rating != "" {
				meta.ContentRating = r.Rating
				break
			}
		}
	}

	// Watch providers — US flatrate first, then rent
	if us, ok := result.WatchProviders.Results["US"]; ok {
		seen := make(map[int]bool)
		for _, p := range us.Flatrate {
			if !seen[p.ProviderID] && p.ProviderName != "" {
				seen[p.ProviderID] = true
				meta.WatchProviders = append(meta.WatchProviders, WatchProvider{
					ID: p.ProviderID, Name: p.ProviderName,
				})
			}
		}
		for _, p := range us.Rent {
			if !seen[p.ProviderID] && p.ProviderName != "" {
				seen[p.ProviderID] = true
				meta.WatchProviders = append(meta.WatchProviders, WatchProvider{
					ID: p.ProviderID, Name: p.ProviderName,
				})
			}
		}
	}

	return meta, nil
}

func (t *TMDB) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	if t.readToken != "" {
		req.Header.Set("Authorization", "Bearer "+t.readToken)
	} else {
		q := req.URL.Query()
		q.Set("api_key", t.apiKey)
		req.URL.RawQuery = q.Encode()
	}
	resp, err := t.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("tmdb http %d for %s", resp.StatusCode, path)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
