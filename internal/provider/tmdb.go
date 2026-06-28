package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const tmdbBaseURL = "https://api.themoviedb.org/3"
const tmdbImageBase = "https://image.tmdb.org/t/p"

// TMDB is the TMDB metadata provider.
type TMDB struct {
	mu         sync.RWMutex
	apiKey     string
	readToken  string
	httpClient *http.Client
}

// NewTMDB creates a TMDB provider. Provide either apiKey or readToken (readToken preferred).
func NewTMDB(apiKey, readToken string) *TMDB {
	return &TMDB{
		apiKey:     apiKey,
		readToken:  readToken,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// SetHTTPClient replaces the transport used for TMDB requests.
func (t *TMDB) SetHTTPClient(client *http.Client) {
	if client == nil {
		return
	}
	t.httpClient = client
}

// UpdateCredentials swaps the live TMDB credentials without replacing the
// provider, so UI-saved keys take effect immediately.
func (t *TMDB) UpdateCredentials(apiKey, readToken string) {
	t.mu.Lock()
	t.apiKey = apiKey
	t.readToken = readToken
	t.mu.Unlock()
}

func (t *TMDB) credentials() (string, string) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.apiKey, t.readToken
}

// HasCredentials reports whether the provider can make authenticated TMDB requests.
func (t *TMDB) HasCredentials() bool {
	apiKey, readToken := t.credentials()
	return apiKey != "" || readToken != ""
}

func (t *TMDB) Name() string { return "tmdb" }

// Fetch retrieves TMDB metadata for a media item.
// mediaType must be "movie" or "tv"; id must be a numeric TMDB ID or an IMDb tt-ID.
func (t *TMDB) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	return t.FetchArtwork(ctx, mediaType, id, ArtworkOptions{})
}

// FetchArtwork retrieves TMDB metadata honoring artwork language, text
// preference, and size options when selecting poster/backdrop/logo variants.
func (t *TMDB) FetchArtwork(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error) {
	apiKey, readToken := t.credentials()
	if apiKey == "" && readToken == "" {
		return nil, fmt.Errorf("tmdb: no api key or read token configured")
	}
	// resolve IMDb ID → TMDB ID if needed
	tmdbID, resolvedType, err := t.resolveID(ctx, mediaType, id)
	if err != nil {
		return nil, fmt.Errorf("tmdb: resolve id %q: %w", id, err)
	}
	return t.fetchByTMDBID(ctx, resolvedType, tmdbID, opts)
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
	// Normalize media type. Only movie/series are meaningful here; artwork
	// surface names (poster/backdrop/logo) are not content-type hints.
	resolvedType := "movie"
	if isSeriesType(mediaType) {
		resolvedType = "tv"
	}
	return id, resolvedType, nil
}

func (t *TMDB) fetchByTMDBID(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error) {
	lang := strings.ToLower(strings.TrimSpace(opts.Language))
	// Pull image variants in the preferred language plus English and
	// language-neutral (textless) art so selection has candidates.
	imgLangs := "en,null"
	if lang != "" && lang != "en" {
		imgLangs = lang + ",en,null"
	}
	path := tmdbBaseURL + "/" + mediaType + "/" + id +
		"?append_to_response=images,release_dates,content_ratings,watch%2Fproviders" +
		"&include_image_language=" + imgLangs
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
		Images       struct {
			Posters   []tmdbImage `json:"posters"`
			Backdrops []tmdbImage `json:"backdrops"`
			Logos     []tmdbImage `json:"logos"`
		} `json:"images"`
		Genres []struct {
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
					LogoPath     string `json:"logo_path"`
				} `json:"flatrate"`
				Rent []struct {
					ProviderID   int    `json:"provider_id"`
					ProviderName string `json:"provider_name"`
					LogoPath     string `json:"logo_path"`
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

	// Source resolution: w780/w1280 are plenty for normal output, but large
	// and 4k renders need the original upload to avoid upscaling.
	posterRes, backdropRes := "/w780", "/w1280"
	if opts.Size == "large" || opts.Size == "4k" {
		posterRes, backdropRes = "/original", "/original"
	}

	posterPath := selectImagePath(result.Images.Posters, result.PosterPath, lang, opts.TextPreference)
	if posterPath != "" {
		meta.PosterURL = tmdbImageBase + posterRes + posterPath
	}
	backdropPath := selectImagePath(result.Images.Backdrops, result.BackdropPath, lang, opts.TextPreference)
	if backdropPath != "" {
		meta.BackdropURL = tmdbImageBase + backdropRes + backdropPath
	}
	if logoPath := selectImagePath(result.Images.Logos, "", lang, ""); logoPath != "" {
		meta.LogoURL = tmdbImageBase + "/w780" + logoPath
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
					ID: p.ProviderID, Name: p.ProviderName, LogoPath: p.LogoPath,
				})
			}
		}
		for _, p := range us.Rent {
			if !seen[p.ProviderID] && p.ProviderName != "" {
				seen[p.ProviderID] = true
				meta.WatchProviders = append(meta.WatchProviders, WatchProvider{
					ID: p.ProviderID, Name: p.ProviderName, LogoPath: p.LogoPath,
				})
			}
		}
	}

	return meta, nil
}

// tmdbImage is one entry in a TMDB images array.
type tmdbImage struct {
	FilePath    string  `json:"file_path"`
	Iso639      *string `json:"iso_639_1"`
	VoteAverage float64 `json:"vote_average"`
}

// selectImagePath picks an image variant according to language and text
// preference. defaultPath is TMDB's canonical pick (poster_path etc.) and is
// the fallback whenever no candidate matches.
//
// Preferences:
//   - "" / "original": language match if requested, else the default
//   - "textless" / "clean": language-neutral art (no baked-in title text)
//   - "alternative": a different variant than the default pick
//   - "random": any candidate, varies between cache refreshes
func selectImagePath(images []tmdbImage, defaultPath, lang, pref string) string {
	if len(images) == 0 {
		return defaultPath
	}

	langOf := func(img tmdbImage) string {
		if img.Iso639 == nil {
			return ""
		}
		return strings.ToLower(*img.Iso639)
	}
	// bestBy returns the highest-voted image matching the predicate.
	bestBy := func(match func(tmdbImage) bool) string {
		best, bestVotes := "", -1.0
		for _, img := range images {
			if img.FilePath == "" || !match(img) {
				continue
			}
			if img.VoteAverage > bestVotes {
				best, bestVotes = img.FilePath, img.VoteAverage
			}
		}
		return best
	}

	inLang := func(img tmdbImage) bool { return lang != "" && langOf(img) == lang }
	textless := func(img tmdbImage) bool { return langOf(img) == "" }

	switch pref {
	case "textless", "clean":
		if p := bestBy(textless); p != "" {
			return p
		}
	case "alternative":
		// The top-voted non-default candidate is almost always a near-twin of
		// the canonical art (alternate scans of the same poster), so rank the
		// non-default candidates and skip one to reach visibly different art.
		base := defaultPath
		if base == "" {
			base = bestBy(func(tmdbImage) bool { return true })
		}
		var candidates []tmdbImage
		for _, img := range images {
			if img.FilePath == "" || img.FilePath == base {
				continue
			}
			if lang == "" || inLang(img) || langOf(img) == "en" || textless(img) {
				candidates = append(candidates, img)
			}
		}
		sort.Slice(candidates, func(i, j int) bool {
			return candidates[i].VoteAverage > candidates[j].VoteAverage
		})
		if len(candidates) > 1 {
			return candidates[1].FilePath
		}
		if len(candidates) == 1 {
			return candidates[0].FilePath
		}
	case "random":
		candidates := make([]string, 0, len(images))
		for _, img := range images {
			if img.FilePath != "" {
				candidates = append(candidates, img.FilePath)
			}
		}
		if len(candidates) > 0 {
			return candidates[rand.Intn(len(candidates))]
		}
	}

	// Language preference applies to the default/original path too: a
	// requested non-English language wins over TMDB's canonical pick.
	if lang != "" && lang != "en" {
		if p := bestBy(inLang); p != "" {
			return p
		}
	}
	if defaultPath != "" {
		return defaultPath
	}
	return bestBy(func(tmdbImage) bool { return true })
}

// TitleResult is one search/trending hit.
type TitleResult struct {
	TMDBID    int    `json:"tmdbId"`
	MediaType string `json:"mediaType"` // movie | tv
	Title     string `json:"title"`
	Year      int    `json:"year"`
}

type tmdbListItem struct {
	ID           int    `json:"id"`
	MediaType    string `json:"media_type"`
	Title        string `json:"title"`
	Name         string `json:"name"`
	ReleaseDate  string `json:"release_date"`
	FirstAirDate string `json:"first_air_date"`
}

func toTitleResults(items []tmdbListItem, limit int) []TitleResult {
	out := make([]TitleResult, 0, limit)
	for _, it := range items {
		if it.MediaType != "movie" && it.MediaType != "tv" {
			continue
		}
		title := it.Title
		if title == "" {
			title = it.Name
		}
		if title == "" {
			continue
		}
		date := it.ReleaseDate
		if date == "" {
			date = it.FirstAirDate
		}
		year := 0
		if len(date) >= 4 {
			year, _ = strconv.Atoi(date[:4])
		}
		out = append(out, TitleResult{TMDBID: it.ID, MediaType: it.MediaType, Title: title, Year: year})
		if len(out) >= limit {
			break
		}
	}
	return out
}

// SearchTitles finds movies and TV shows matching the query.
func (t *TMDB) SearchTitles(ctx context.Context, query string) ([]TitleResult, error) {
	var result struct {
		Results []tmdbListItem `json:"results"`
	}
	path := tmdbBaseURL + "/search/multi?include_adult=false&query=" + url.QueryEscape(query)
	if err := t.get(ctx, path, &result); err != nil {
		return nil, err
	}
	return toTitleResults(result.Results, 8), nil
}

// TrendingTitles returns this week's trending movies and TV shows.
func (t *TMDB) TrendingTitles(ctx context.Context) ([]TitleResult, error) {
	var result struct {
		Results []tmdbListItem `json:"results"`
	}
	if err := t.get(ctx, tmdbBaseURL+"/trending/all/week", &result); err != nil {
		return nil, err
	}
	return toTitleResults(result.Results, 20), nil
}

// LookupIMDbID resolves a TMDB ID to its IMDb tt-ID (may be empty).
func (t *TMDB) LookupIMDbID(ctx context.Context, mediaType string, tmdbID int) (string, error) {
	var result struct {
		IMDbID string `json:"imdb_id"`
	}
	path := tmdbBaseURL + "/" + mediaType + "/" + strconv.Itoa(tmdbID) + "/external_ids"
	if err := t.get(ctx, path, &result); err != nil {
		return "", err
	}
	return result.IMDbID, nil
}

func (t *TMDB) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	apiKey, readToken := t.credentials()
	if readToken != "" {
		req.Header.Set("Authorization", "Bearer "+readToken)
	} else {
		q := req.URL.Query()
		q.Set("api_key", apiKey)
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
