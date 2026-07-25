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
		httpClient: newHTTPClient("tmdb", 10*time.Second),
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
	id = strings.TrimSpace(id)

	// IMDB tt-IDs need the find endpoint to get a TMDB ID.
	if strings.HasPrefix(id, "tt") {
		tmdbID, resolvedType, found, err := t.findByExternalID(ctx, id, "imdb_id")
		if err != nil {
			return "", "", err
		}
		if found {
			return tmdbID, resolvedType, nil
		}
		return "", "", fmt.Errorf("no TMDB match for IMDB id %q", id)
	}

	// TVDB IDs (emitted by AIOMetadata's imdb-less art fallback, e.g.
	// "tvdb:81189") resolve via TMDB's find endpoint keyed on the TVDB source.
	if rest, ok := stripPrefix(id, "tvdb:"); ok {
		tmdbID, resolvedType, found, err := t.findByExternalID(ctx, rest, "tvdb_id")
		if err != nil {
			return "", "", err
		}
		if found {
			return tmdbID, resolvedType, nil
		}
		return "", "", fmt.Errorf("no TMDB match for TVDB id %q", id)
	}

	// Native TMDB IDs may arrive bare ("1396"), scheme-prefixed ("tmdb:1396"),
	// or carrying a content-type token ("tmdb:series:1396", "series:1396") —
	// the composite forms AIOMetadata emits when it has no IMDb id for a title.
	rest := id
	if r, ok := stripPrefix(rest, "tmdb:"); ok {
		rest = r
	}
	for _, tok := range []string{"movie:", "series:", "tv:"} {
		if r, ok := stripPrefix(rest, tok); ok {
			mediaType = strings.TrimSuffix(tok, ":")
			rest = r
			break
		}
	}

	// Normalize media type. Only movie/series are meaningful here; artwork
	// surface names (poster/backdrop/logo) are not content-type hints.
	resolvedType := "movie"
	if isSeriesType(mediaType) {
		resolvedType = "tv"
	}
	return rest, resolvedType, nil
}

// findByExternalID resolves an external identifier (an IMDb tt-id or a TVDB id)
// to a TMDB id via TMDB's /find endpoint. found is false when TMDB returns no
// match; err is non-nil only on a transport/decoding failure.
func (t *TMDB) findByExternalID(ctx context.Context, externalID, source string) (id, contentType string, found bool, err error) {
	path := tmdbBaseURL + "/find/" + url.PathEscape(externalID) + "?external_source=" + source
	var result struct {
		MovieResults []struct {
			ID int `json:"id"`
		} `json:"movie_results"`
		TVResults []struct {
			ID int `json:"id"`
		} `json:"tv_results"`
	}
	if err := t.get(ctx, path, &result); err != nil {
		return "", "", false, err
	}
	if len(result.MovieResults) > 0 {
		return strconv.Itoa(result.MovieResults[0].ID), "movie", true, nil
	}
	if len(result.TVResults) > 0 {
		return strconv.Itoa(result.TVResults[0].ID), "tv", true, nil
	}
	return "", "", false, nil
}

// EpisodeInfo holds the per-episode data resolved from TMDB: the episode still
// image, TMDB's own episode rating, and the episode's IMDb tconst (so other
// providers can look up per-episode ratings).
type EpisodeInfo struct {
	Name     string
	StillURL string
	IMDbID   string
	Rating   *Rating
}

// FetchEpisode resolves a single episode of a series. seriesID may be an IMDb
// tt-id or a TMDB numeric id. Returns the episode still, TMDB episode rating,
// and the episode's own IMDb id — the pieces needed for per-episode thumbnails.
func (t *TMDB) FetchEpisode(ctx context.Context, seriesID string, season, episode int, opts ArtworkOptions) (*EpisodeInfo, error) {
	apiKey, readToken := t.credentials()
	if apiKey == "" && readToken == "" {
		return nil, fmt.Errorf("tmdb: no api key or read token configured")
	}
	tmdbID, _, err := t.resolveID(ctx, "series", seriesID)
	if err != nil {
		return nil, fmt.Errorf("tmdb: resolve series %q: %w", seriesID, err)
	}
	path := fmt.Sprintf("%s/tv/%s/season/%d/episode/%d?append_to_response=external_ids",
		tmdbBaseURL, tmdbID, season, episode)
	var result struct {
		Name        string  `json:"name"`
		StillPath   string  `json:"still_path"`
		VoteAverage float64 `json:"vote_average"`
		VoteCount   int     `json:"vote_count"`
		ExternalIDs struct {
			IMDbID string `json:"imdb_id"`
		} `json:"external_ids"`
	}
	if err := t.get(ctx, path, &result); err != nil {
		return nil, err
	}
	info := &EpisodeInfo{Name: result.Name, IMDbID: result.ExternalIDs.IMDbID}
	stillRes := "/w780"
	if opts.Size == "large" || opts.Size == "4k" {
		stillRes = "/original"
	}
	if result.StillPath != "" {
		info.StillURL = tmdbImageBase + stillRes + result.StillPath
	}
	if result.VoteAverage > 0 {
		info.Rating = &Rating{
			Source: "tmdb",
			Value:  result.VoteAverage,
			Votes:  result.VoteCount,
			Label:  fmt.Sprintf("%.1f", result.VoteAverage),
		}
	}
	return info, nil
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
		Title         string  `json:"title"`
		Name          string  `json:"name"` // TV
		OriginalTitle string  `json:"original_title"`
		OriginalName  string  `json:"original_name"` // TV
		Overview      string  `json:"overview"`
		ReleaseDate   string  `json:"release_date"`
		FirstAirDate  string  `json:"first_air_date"`
		VoteAverage   float64 `json:"vote_average"`
		VoteCount     int     `json:"vote_count"`
		PosterPath    string  `json:"poster_path"`
		BackdropPath  string  `json:"backdrop_path"`
		Images        struct {
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
					Type          int    `json:"type"`         // 2,3 = theatrical; 4 = digital; 5 = physical
					ReleaseDate   string `json:"release_date"` // ISO 8601
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

	originalTitle := result.OriginalTitle
	if originalTitle == "" {
		originalTitle = result.OriginalName
	}

	meta := &MediaMeta{
		Title:         title,
		OriginalTitle: originalTitle,
		Year:          year,
		Overview:      result.Overview,
		Language:      "en",
	}

	// Source resolution: w780/w1280 are plenty for normal output, but large
	// and 4k renders need the original upload to avoid upscaling.
	posterRes, backdropRes := "/w780", "/w1280"
	if opts.Size == "large" || opts.Size == "4k" {
		posterRes, backdropRes = "/original", "/original"
	}

	posterPath := selectImagePath(result.Images.Posters, result.PosterPath, lang, opts)
	if posterPath != "" {
		meta.PosterURL = tmdbImageBase + posterRes + posterPath
	}
	backdropPath := selectImagePath(result.Images.Backdrops, result.BackdropPath, lang, opts)
	if backdropPath != "" {
		meta.BackdropURL = tmdbImageBase + backdropRes + backdropPath
	}
	// Logos never use the random text/quality filters.
	if logoPath := selectImagePath(result.Images.Logos, "", lang, ArtworkOptions{}); logoPath != "" {
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

	// Release status. Any region counts — a title out on digital somewhere is no
	// longer cinemas-only — so the entries are flattened across regions first.
	{
		var entries []releaseEntry
		for _, r := range result.ReleaseDates.Results {
			for _, d := range r.Dates {
				entries = append(entries, releaseEntry{kind: d.Type, date: d.ReleaseDate})
			}
		}
		meta.ReleaseStatus = resolveReleaseStatus(entries, time.Now())
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

	// Watch providers — flatrate first, then rent, for the requested region.
	region := strings.ToUpper(strings.TrimSpace(opts.WatchProvidersCountry))
	if region == "" {
		region = "US"
	}
	if us, ok := result.WatchProviders.Results[region]; ok {
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
	VoteCount   int     `json:"vote_count"`
	Width       int     `json:"width"`
	Height      int     `json:"height"`
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
func selectImagePath(images []tmdbImage, defaultPath, lang string, opts ArtworkOptions) string {
	pref := opts.TextPreference
	if len(images) == 0 {
		return defaultPath
	}

	langOf := func(img tmdbImage) string {
		if img.Iso639 == nil {
			return ""
		}
		return strings.ToLower(*img.Iso639)
	}
	// TMDB serves many logos as SVG, which the raster render pipeline can't
	// decode. Skip them so selection never lands on an undecodable image and
	// falls through to a placeholder.
	isRenderable := func(path string) bool {
		return path != "" && !strings.HasSuffix(strings.ToLower(path), ".svg")
	}
	// bestBy returns the highest-voted image matching the predicate.
	bestBy := func(match func(tmdbImage) bool) string {
		best, bestVotes := "", -1.0
		for _, img := range images {
			if !isRenderable(img.FilePath) || !match(img) {
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
			if !isRenderable(img.FilePath) || img.FilePath == base {
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
		candidates := make([]tmdbImage, 0, len(images))
		for _, img := range images {
			if !isRenderable(img.FilePath) {
				continue
			}
			switch opts.RandomText {
			case "text":
				if textless(img) {
					continue
				}
			case "textless":
				if !textless(img) {
					continue
				}
			}
			if opts.RandomLanguage == "requested" && lang != "" && !inLang(img) {
				continue
			}
			if img.VoteCount < opts.RandomMinVoteCount {
				continue
			}
			if img.VoteAverage < opts.RandomMinVoteAvg {
				continue
			}
			if opts.RandomMinWidth > 0 && img.Width < opts.RandomMinWidth {
				continue
			}
			if opts.RandomMinHeight > 0 && img.Height < opts.RandomMinHeight {
				continue
			}
			candidates = append(candidates, img)
		}
		if len(candidates) > 0 {
			return candidates[rand.Intn(len(candidates))].FilePath
		}
		// No candidate passed the filters — fall back.
		if opts.RandomFallback == "original" {
			return defaultPath
		}
		if p := bestBy(func(tmdbImage) bool { return true }); p != "" {
			return p
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

// TMDB release types: 2 and 3 are limited and wide theatrical, 4 is digital.
const (
	releaseTypeTheatricalLimited = 2
	releaseTypeTheatrical        = 3
	releaseTypeDigital           = 4
)

// releaseEntry is one region's record of a release of a given kind.
type releaseEntry struct {
	kind int
	date string
}

// releaseLanded reports whether any entry of one of the given kinds has already
// happened. An entry with an unparseable date counts as landed: TMDB records
// releases it knows about but cannot date, and those are titles already out.
func releaseLanded(entries []releaseEntry, now time.Time, kinds ...int) bool {
	for _, e := range entries {
		matched := false
		for _, k := range kinds {
			if e.kind == k {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}
		ts, err := time.Parse("2006-01-02T15:04:05.000Z", e.date)
		if err != nil || !ts.After(now) {
			return true
		}
	}
	return false
}

// resolveReleaseStatus picks the badge-worthy release state, preferring digital
// because a title available at home has moved past its cinema run.
func resolveReleaseStatus(entries []releaseEntry, now time.Time) string {
	switch {
	case releaseLanded(entries, now, releaseTypeDigital):
		return "digital"
	case releaseLanded(entries, now, releaseTypeTheatricalLimited, releaseTypeTheatrical):
		return "cinemas"
	}
	return ""
}
